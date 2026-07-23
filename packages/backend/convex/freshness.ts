import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireAdmin } from "./auth";
import { missingEnvVariableUrl } from "./utils";
import {
  selectSource,
  cleanIssuerUrl,
  isIssuerAuthoritativeUrl,
  isTrustedRedirect,
  type SourceSelection,
} from "./cardSourceSelect";
import {
  parseExtraction,
  toNum,
  type ExtractedProfile,
} from "./cardExtractionParse";
import {
  diffScalar,
  diffNamedArray,
  isMassRemoval,
  type NamedItem,
} from "./cardDataDiff";
import { gateChange } from "./autoApplyGate";
import { applyItemDelta } from "./arrayDelta";
import { norm } from "./cardDataDiff";
import {
  canonicalValue,
  matchesRejected,
  type RejectedRow,
} from "./reviewSuppress";
import { issuerAllowlist } from "./freshnessConfig";
import { fetchIssuerPage, type FetchedPage } from "./pageFetch";
import { planBatch, isRetryableStatus, retryDelayMs } from "./freshnessPlan";
import {
  ARRAY_FIELD_NAME_KEYS,
  categoryToNamed,
  namedToCategory,
  benefitToNamed,
  namedToBenefit,
} from "./cardFieldMap";

// Daily card-data freshness pipeline. For each card in a user's wallet that is
// past its verify TTL, fetch the card's official issuer page and ask an LLM
// (OpenRouter, haiku-4.5 default) to extract the current terms from its full
// text (falling back to LLM web search when the page can't be fetched), then
// diff them against what we store. Confident, cited, in-bounds changes are
// auto-applied (fees, earn categories, benefits); everything else falls back to
// the human review queue. AUTO_APPLY_ENABLED gates whether confident changes are
// actually written ("shadow" mode records them for measurement instead).
//
// Scheduling: the daily cron drives a self-chaining driver (verifyWalletBatch)
// that repeatedly claims the most-overdue owned cards via the
// cardDetails.by_lastVerifiedAt index (claimDueCards — the claim itself is the
// crash-retry backoff), staggers the per-card LLM calls, and stops at a daily
// call budget. The per-card TTL is tracked by cardDetails.lastVerifiedAt. See
// docs/plans/2026-07-22-auto-card-data-freshness-plan.md.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_SIGNUP_URL = "https://openrouter.ai/keys";
// Bake-off 2026-07-22 on fetched issuer pages (6 cards): haiku matched
// sonnet-5 on fee accuracy (5/6) at 0.35x the cost and half the latency, with
// 92% of its benefits recall; deepseek-v4-flash missed fees (3/6), returned an
// empty extraction for one card, and stalls under load. Override per
// deployment with OPENROUTER_MODEL.
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

const changeTypeValidator = v.union(
  v.literal("patch"),
  v.literal("add"),
  v.literal("remove"),
);

// The signup-bonus block never auto-applies (gate reviewOnlyFields) until
// shadow precision proves the extraction on it — proposals go to review.
const SIGNUP_REVIEW_ONLY = [
  "signupBonusAmount",
  "signupBonusSpend",
  "signupBonusLength",
  "signupBonusLengthPeriod",
  "signupBonusDesc",
];

// ── Config (env, with safe defaults) ────────────────────────────────────────
function config() {
  const num = (k: string, d: number) => {
    const n = Number(process.env[k]);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    confidenceThreshold: num("CONFIDENCE_AUTO_APPLY", 0.85),
    ttlMs: num("CARD_VERIFY_TTL_DAYS", 7) * 24 * 60 * 60 * 1000,
    // After a failed extraction, retry this soon instead of waiting a full TTL.
    failureRetryMs: num("FRESHNESS_FAILURE_RETRY_HOURS", 6) * 60 * 60 * 1000,
    perRunCap: num("FRESHNESS_PER_RUN_CAP", 25),
    // Hard ceiling on LLM calls per daily chain (cost control).
    dailyCap: num("FRESHNESS_DAILY_CAP", 150),
    // Stagger between scheduled per-card verifications — avoids bursting the
    // whole batch at OpenRouter concurrently.
    callSpacingMs: num("FRESHNESS_CALL_SPACING_MS", 5000),
    // Concurrency for the admin's manual verifyMyWallet run.
    walletConcurrency: num("FRESHNESS_WALLET_CONCURRENCY", 3),
    // Bounded retries inside one extraction call (429/5xx/network only).
    maxRetries: num("OPENROUTER_MAX_RETRIES", 2),
    // Off by default: first deploy runs in shadow (record, don't write).
    autoApplyEnabled: process.env.AUTO_APPLY_ENABLED === "true",
    allowlist: issuerAllowlist(process.env.ISSUER_DOMAIN_ALLOWLIST),
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────
export const getCardForFreshness = internalQuery({
  args: { cardKey: v.string() },
  handler: async (ctx, { cardKey }) => {
    const d = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .unique();
    if (!d) return null;
    return {
      cardKey: d.cardKey,
      cardName: d.cardName,
      cardIssuer: d.cardIssuer,
      cardUrl: d.cardUrl,
      annualFee: d.annualFee,
      fxFee: d.fxFee,
      signupBonusAmount: d.signupBonusAmount,
      signupBonusSpend: d.signupBonusSpend,
      signupBonusLength: d.signupBonusLength,
      signupBonusLengthPeriod: d.signupBonusLengthPeriod,
      signupBonusDesc: d.signupBonusDesc,
      spendBonusCategory: d.spendBonusCategory ?? [],
      benefit: d.benefit ?? [],
    };
  },
});

// The cardKeys in one user's wallet (drives the manual verifyMyWallet run).
export const getUserCardKeys = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const cards = await ctx.db
      .query("userCards")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return cards.map((c) => c.cardKey);
  },
});

// Select AND claim the next most-overdue owned cards in one transaction. The
// claim patches lastVerifiedAt to the failure-backoff timestamp, which (a)
// prevents a concurrent/next chain invocation from double-scheduling the same
// card, and (b) means a verification action that crashes mid-flight self-heals:
// the card simply becomes due again in retryMs. by_lastVerifiedAt ascending
// visits never-verified cards first (missing field sorts lowest), then the
// stalest — most-overdue-first is inherently starvation-free.
export const claimDueCards = internalMutation({
  args: { limit: v.number(), ttlMs: v.number(), retryMs: v.number() },
  handler: async (ctx, { limit, ttlMs, retryMs }) => {
    const now = Date.now();
    const cutoff = now - ttlMs;
    // Bounded scan: read up to limit*10 due candidates, keep the owned ones.
    // Unowned cards are skipped (not claimed) so they don't consume budget;
    // they also never verify — freshness only covers wallet cards.
    const scanCap = limit * 10;
    // Two reads so never-verified docs (lastVerifiedAt unset) are included
    // regardless of how the index range treats a missing optional field.
    const neverVerified = await ctx.db
      .query("cardDetails")
      .withIndex("by_lastVerifiedAt", (q) => q.eq("lastVerifiedAt", undefined))
      .take(scanCap);
    const overdue = await ctx.db
      .query("cardDetails")
      .withIndex("by_lastVerifiedAt", (q) => q.lt("lastVerifiedAt", cutoff))
      .order("asc")
      .take(scanCap);
    const seen = new Set<string>();
    const cardKeys: string[] = [];
    for (const d of [...neverVerified, ...overdue]) {
      if (cardKeys.length >= limit) break;
      if (seen.has(d.cardKey)) continue;
      seen.add(d.cardKey);
      // Belt-and-suspenders: skip docs the range read shouldn't have returned
      // (claimed by a concurrent invocation between the two reads).
      if ((d.lastVerifiedAt ?? 0) >= cutoff) continue;
      const owner = await ctx.db
        .query("userCards")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", d.cardKey))
        .first();
      if (!owner) continue;
      await ctx.db.patch(d._id, { lastVerifiedAt: now - ttlMs + retryMs });
      cardKeys.push(d.cardKey);
    }
    return { cardKeys };
  },
});

// ── Run log: one row per cron chain / manual wallet verify ──────────────────
export const startRun = internalMutation({
  args: { source: v.union(v.literal("cron"), v.literal("manual")) },
  handler: async (ctx, { source }) => {
    return await ctx.db.insert("pipelineRuns", {
      pipeline: "freshness",
      source,
      startedAt: Date.now(),
      scheduled: 0,
      extracted: 0,
      failed: 0,
      autoApplied: 0,
      enqueued: 0,
      suppressed: 0,
      suspect: 0,
    });
  },
});

export const finishRun = internalMutation({
  args: { runId: v.id("pipelineRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (run && run.finishedAt === undefined)
      await ctx.db.patch(runId, { finishedAt: Date.now() });
  },
});

const runCounterValidator = v.object({
  scheduled: v.optional(v.number()),
  extracted: v.optional(v.number()),
  failed: v.optional(v.number()),
  autoApplied: v.optional(v.number()),
  enqueued: v.optional(v.number()),
  suppressed: v.optional(v.number()),
  suspect: v.optional(v.number()),
});

type RunCounters = {
  scheduled?: number;
  extracted?: number;
  failed?: number;
  autoApplied?: number;
  enqueued?: number;
  suppressed?: number;
  suspect?: number;
};

async function bumpRun(
  ctx: { db: any },
  runId: string | undefined,
  deltas: RunCounters,
) {
  if (!runId) return;
  const run = await ctx.db.get(runId);
  if (!run) return;
  const patch: Record<string, number> = {};
  for (const [k, delta] of Object.entries(deltas)) {
    if (delta) patch[k] = ((run as any)[k] ?? 0) + delta;
  }
  if (Object.keys(patch).length > 0) await ctx.db.patch(runId, patch);
}

export const bumpRunCounters = internalMutation({
  args: { runId: v.id("pipelineRuns"), deltas: runCounterValidator },
  handler: async (ctx, { runId, deltas }) => {
    await bumpRun(ctx, runId, deltas);
  },
});

// ── LLM extraction ─────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function extractProfile(
  cardName: string,
  cardIssuer: string,
  sourceHint: string | undefined,
  opts: { model: string; maxRetries: number },
  // Fetch-first: when the issuer page was fetched successfully, its full text
  // rides in the prompt and the web-search plugin is skipped — search snippets
  // can't see whole pages, which made array fields unverifiable.
  page?: FetchedPage,
): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error(
      missingEnvVariableUrl("OPENROUTER_API_KEY", OPENROUTER_SIGNUP_URL),
    );
    return null;
  }
  const source = page
    ? `The full text of the issuer's official page (${page.finalUrl}) is included below — extract from it. `
    : sourceHint
      ? `Prefer this official page: ${sourceHint}. `
      : `Search the web and prefer the issuer's own official page. `;
  const prompt =
    `Extract the current rewards terms for the "${cardName}" credit card issued by ${cardIssuer}, as of today. ` +
    source +
    `Report the issuer's standard US consumer terms. Reply with ONLY a JSON object, no prose:\n` +
    `{"annualFee":{"value":<number>,"confidence":<0-1>,"sourceUrl":"<url>"},` +
    `"fxFee":{"value":<foreign transaction fee percent, 0 if none>,"confidence":<0-1>,"sourceUrl":"<url>"},` +
    `"signupBonus":{"amount":<points/miles/cash bonus number>,"spend":<required spend number>,"lengthOfPeriod":"<e.g. 3 months>","desc":"<short>","confidence":<0-1>,"sourceUrl":"<url>"},` +
    `"earnCategories":[{"name":"<category>","multiplier":<number>,"spendLimit":<number or 0>,"desc":"<short>","confidence":<0-1>,"sourceUrl":"<url>"}],` +
    `"benefits":[{"title":"<benefit>","desc":"<short>","confidence":<0-1>,"sourceUrl":"<url>"}]}. ` +
    `multiplier is the cash-back % or points-per-dollar. Omit signupBonus if the card has none. ` +
    `List EVERY distinct earn category and benefit stated — premium cards commonly have 20-40 ` +
    `benefits (statement credits, lounge access, elite statuses, insurances, purchase protections). ` +
    `Do not summarize, group, or stop early; enumerate them all. ` +
    `Set confidence low if the page is ambiguous or not the issuer's own.` +
    (page
      ? `\nUse only the page text below. Omit any field the page does not state — never guess. ` +
        `Use "${page.finalUrl}" as sourceUrl.\n\nPAGE TEXT:\n${page.text}`
      : "");

  // Bounded retry on rate limits / server errors / network failures; other
  // client errors fail fast (retrying a 400/401 won't help).
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: opts.model,
          // Page text in hand means no web search — the plugin only adds cost
          // and snippet noise once the model can read the real page.
          ...(page ? {} : { plugins: [{ id: "web", max_results: 5 }] }),
          // Belt-and-suspenders with parseExtraction's fence/prose-tolerant
          // regex parse: ask the provider for a JSON-only response outright.
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        if (isRetryableStatus(res.status) && attempt < opts.maxRetries) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        console.error(
          `Freshness extraction failed for '${cardName}': openrouter HTTP ${res.status}`,
        );
        return null;
      }
      const data: any = await res.json();
      return data?.choices?.[0]?.message?.content ?? null;
    } catch (e) {
      if (attempt < opts.maxRetries) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      console.error(`Freshness extraction failed for '${cardName}'`, e);
      return null;
    }
  }
  return null;
}

// ── Change type passed action -> mutation ────────────────────────────────────
type PipelineChange = {
  field: string;
  changeType: "patch" | "add" | "remove";
  name?: string;
  current?: unknown;
  proposed?: unknown;
  confidence?: number;
  sourceUrl?: string;
  autoApply: boolean;
};

// Shape returned by getCardForFreshness.
type FreshnessDetail = {
  cardKey: string;
  cardName: string;
  cardIssuer: string;
  cardUrl?: string;
  annualFee?: number;
  fxFee?: number;
  signupBonusAmount?: number | string;
  signupBonusSpend?: number;
  signupBonusLength?: number | string;
  signupBonusLengthPeriod?: string;
  signupBonusDesc?: string;
  spendBonusCategory: any[];
  benefit: any[];
};

// Verify one card end-to-end.
export const verifyOneCard = internalAction({
  args: { cardKey: v.string(), runId: v.optional(v.id("pipelineRuns")) },
  handler: async (ctx, { cardKey, runId }) => {
    const cfg = config();
    const detail = await ctx.runQuery(internal.freshness.getCardForFreshness, {
      cardKey,
    });
    if (!detail) return;

    const selection = selectSource({
      cardUrl: detail.cardUrl,
      cardIssuer: detail.cardIssuer,
      allowlist: cfg.allowlist,
    });
    // Fetch-first: pull the issuer page ourselves and extract from its full
    // text. A failed fetch (bot wall, JS-only shell, dead URL) falls back to
    // the web-search path — same behavior as before this existed.
    const fetched =
      selection.mode === "issuer-url"
        ? await fetchIssuerPage(selection.url!)
        : null;
    // Redirects can leave the issuer's domain (parked/affiliate targets, or a
    // DIFFERENT issuer's allowlisted domain); the extraction prompt pins
    // sourceUrl to finalUrl and the gate treats the page as issuer-cited, so
    // only a redirect that stays within this card's issuer may be trusted.
    const page =
      fetched &&
      isTrustedRedirect(
        selection.url!,
        fetched.finalUrl,
        detail.cardIssuer,
        cfg.allowlist,
      )
        ? fetched
        : null;
    if (selection.mode === "issuer-url" && !page)
      console.log(
        fetched
          ? `freshness: redirect left issuer domain (${fetched.finalUrl}) for ${cardKey}, falling back to web search`
          : `freshness: page fetch failed for ${cardKey}, falling back to web search`,
      );
    const raw = await extractProfile(
      detail.cardName,
      detail.cardIssuer,
      selection.mode === "issuer-url" ? selection.url : undefined,
      { model: cfg.model, maxRetries: cfg.maxRetries },
      page ?? undefined,
    );
    const profile = raw ? parseExtraction(raw) : null;
    if (!profile) {
      // Extraction failed (no key / API error / unparseable). Do NOT consume the
      // full TTL — set a short backoff so a transient failure retries soon.
      await ctx.runMutation(internal.freshness.markVerified, {
        cardKey,
        verifiedAt: Date.now() - cfg.ttlMs + cfg.failureRetryMs,
        runId,
      });
      return;
    }

    await runProfilePipeline(ctx, {
      detail,
      profile,
      selection,
      cfg,
      runId,
      arrayPolicy: "guard",
    });
  },
});

// Shared post-extraction pipeline: diff a profile against stored data, gate
// each change, and hand everything to the atomic applyFreshnessChanges
// mutation. Used by the daily pipeline (verifyOneCard) and by external agent
// submissions (processExternalProfile). arrayPolicy "guard" keeps the
// mass-removal guard — an extraction wiping a populated array is a failed
// read; "review-rebuild" is for external whole-array rebuilds: no guard, and
// array changes never auto-apply (every item goes to the review queue).
async function runProfilePipeline(
  ctx: ActionCtx,
  {
    detail,
    profile,
    selection,
    cfg,
    runId,
    arrayPolicy,
  }: {
    detail: FreshnessDetail;
    profile: ExtractedProfile;
    selection: SourceSelection;
    cfg: ReturnType<typeof config>;
    runId?: Id<"pipelineRuns">;
    arrayPolicy: "guard" | "review-rebuild";
  },
) {
  const cardKey = detail.cardKey;
  const gateCfg = {
    confidenceThreshold: cfg.confidenceThreshold,
    cardIssuer: detail.cardIssuer,
    allowlist: cfg.allowlist,
    // Never auto-applied until shadow precision proves the extraction on
    // these; they still surface as review proposals.
    reviewOnlyFields: SIGNUP_REVIEW_ONLY,
  };
  const changes: PipelineChange[] = [];
  // Fields the model actually reported this run — the mutation retires stale
  // pending reviews for these (an old proposal the model no longer makes is
  // outdated). Omitted fields are left untouched.
  const evaluatedFields: string[] = [];
  // Array fields whose diff proposed removing most of the items — the whole
  // extraction for that field is untrustworthy (see isMassRemoval).
  const suspectFields: string[] = [];

  const pushScalar = (
    field: string,
    current: unknown,
    proposed: unknown,
    confidence: number,
    sourceUrl?: string,
  ) => {
    evaluatedFields.push(field);
    const sc = diffScalar(field, current, proposed, confidence, sourceUrl);
    if (sc)
      changes.push({ ...sc, autoApply: gateChange(sc, gateCfg).autoApply });
  };

  // Scalars: annual fee + foreign transaction fee.
  if (profile.annualFee !== undefined) {
    pushScalar(
      "annualFee",
      detail.annualFee,
      profile.annualFee,
      profile.annualFeeConfidence ?? 0,
      profile.annualFeeSourceUrl ?? selection.url,
    );
  }
  if (profile.fxFee !== undefined) {
    pushScalar(
      "fxFee",
      detail.fxFee,
      profile.fxFee,
      profile.fxFeeConfidence ?? 0,
      profile.fxFeeSourceUrl ?? selection.url,
    );
  }

  // Signup-bonus block (review-only via the gate). signupBonusAmount is
  // number|string in the catalog — compare numerically so "60000" vs 60000
  // never reads as a change.
  if (profile.signupBonus !== undefined) {
    const sb = profile.signupBonus;
    const conf = sb.confidence ?? 0;
    const url = sb.sourceUrl ?? selection.url;
    if (sb.amount !== undefined) {
      // Numeric equivalence guard: the catalog stores number|string, so a
      // stored "60000" vs extracted 60000 must not read as a change. The
      // change itself keeps the REAL stored value (staleness checks compare
      // it against the live field verbatim).
      if (toNum(detail.signupBonusAmount) === sb.amount)
        evaluatedFields.push("signupBonusAmount");
      else
        pushScalar(
          "signupBonusAmount",
          detail.signupBonusAmount,
          sb.amount,
          conf,
          url,
        );
    }
    if (sb.spend !== undefined)
      pushScalar(
        "signupBonusSpend",
        detail.signupBonusSpend,
        sb.spend,
        conf,
        url,
      );
    if (sb.length !== undefined)
      pushScalar(
        "signupBonusLength",
        detail.signupBonusLength,
        sb.length,
        conf,
        url,
      );
    if (sb.lengthPeriod !== undefined)
      pushScalar(
        "signupBonusLengthPeriod",
        detail.signupBonusLengthPeriod,
        sb.lengthPeriod,
        conf,
        url,
      );
    if (sb.desc !== undefined)
      pushScalar("signupBonusDesc", detail.signupBonusDesc, sb.desc, conf, url);
  }

  // URL self-heal: when the stored cardUrl was unusable (web-search mode) and
  // the extraction cites an issuer-authoritative page confidently, propose it
  // as the new cardUrl — the next run goes straight to the source.
  if (selection.mode === "web-search") {
    const candidates: Array<{ url?: string; confidence?: number }> = [
      {
        url: profile.annualFeeSourceUrl,
        confidence: profile.annualFeeConfidence,
      },
      { url: profile.fxFeeSourceUrl, confidence: profile.fxFeeConfidence },
      {
        url: profile.signupBonus?.sourceUrl,
        confidence: profile.signupBonus?.confidence,
      },
      ...(profile.earnCategories ?? []).map((c: any) => ({
        url: c.sourceUrl,
        confidence: c.confidence,
      })),
      ...(profile.benefits ?? []).map((b: any) => ({
        url: b.sourceUrl,
        confidence: b.confidence,
      })),
    ];
    const best = candidates
      .filter(
        (c): c is { url: string; confidence: number } =>
          typeof c.url === "string" &&
          (c.confidence ?? 0) >= cfg.confidenceThreshold &&
          isIssuerAuthoritativeUrl(c.url, detail.cardIssuer, cfg.allowlist),
      )
      .sort((a, b) => b.confidence - a.confidence)[0];
    const clean = best ? cleanIssuerUrl(best.url) : null;
    if (clean && clean !== detail.cardUrl) {
      const sc = diffScalar(
        "cardUrl",
        detail.cardUrl,
        clean,
        best!.confidence,
        clean,
      );
      if (sc)
        changes.push({ ...sc, autoApply: gateChange(sc, gateCfg).autoApply });
    }
  }

  // Arrays: earn categories + benefits. Only diff a field the model actually
  // returned — an omitted (undefined) array must not read as "remove all".
  const arrayDiffs: Array<[string, NamedItem[], NamedItem[] | undefined]> = [
    [
      "spendBonusCategory",
      detail.spendBonusCategory.map(categoryToNamed),
      profile.earnCategories,
    ],
    ["benefit", detail.benefit.map(benefitToNamed), profile.benefits],
  ];
  for (const [field, current, proposed] of arrayDiffs) {
    if (proposed === undefined) continue;
    const fieldChanges = diffNamedArray(field, current, proposed);
    // Mass-removal guard: an extraction wiping out most of a populated array
    // is a failed read, not a real delisting — drop ALL of the field's
    // changes (not just removals) and retry on the short backoff. External
    // rebuilds skip it: their removals are deliberate and review-gated.
    if (
      arrayPolicy === "guard" &&
      isMassRemoval(current.length, fieldChanges)
    ) {
      suspectFields.push(field);
      continue;
    }
    evaluatedFields.push(field);
    for (const c of fieldChanges) {
      const proposedItem = "proposed" in c ? (c.proposed as any) : undefined;
      const change: PipelineChange = {
        field: c.field,
        changeType: c.changeType,
        name: c.name,
        current: "current" in c ? c.current : undefined,
        proposed: proposedItem,
        confidence: proposedItem?.confidence,
        sourceUrl: proposedItem?.sourceUrl,
        autoApply: false,
      };
      change.autoApply =
        arrayPolicy === "review-rebuild"
          ? false
          : gateChange(change, gateCfg).autoApply;
      changes.push(change);
    }
  }

  // One atomic mutation: apply auto-approved changes, enqueue the rest for
  // review, audit everything, and advance the TTL — no partial-write window.
  await ctx.runMutation(internal.freshness.applyFreshnessChanges, {
    cardKey,
    changes,
    evaluatedFields,
    suspectFields,
    autoEnabled: cfg.autoApplyEnabled,
    runId,
  });
}

// ── External refresh surface ─────────────────────────────────────────────────
// An agent outside Convex (e.g. a weekly Claude Code session billed to a
// subscription instead of per-token API) runs the extraction itself and
// submits the profile JSON here. The server-side pipeline stays authoritative:
// suppression, gating, provenance, audit, and the review queue all apply.
// Array fields never auto-apply on this path (arrayPolicy "review-rebuild"),
// which also skips the mass-removal guard so junk stored arrays can converge
// through human review.

// Wallet cards most overdue for verification, oldest first — the work list
// for an external refresh session. Read-only: does not claim or patch.
// Returns { candidates, truncated }: candidates are the cap oldest across ALL
// distinct owned cards; truncated flags the (practically unreachable) case
// where distinct keys exceeded the walk ceiling, so partial coverage is
// observable rather than silent.
export const listRefreshCandidates = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const cap = Math.min(limit ?? 25, 100);
    // Wallet-first: freshness only covers owned cards, and distinct owned
    // cardKeys are catalog-bounded (a few thousand at the theoretical max) —
    // walking cardDetails.by_lastVerifiedAt instead would scan the (much
    // larger) never-verified unowned catalog before reaching any wallet card.
    // Skip along the by_cardKey index one DISTINCT key at a time: reads scale
    // with distinct cards, not with userCards rows. The 4,000-key ceiling
    // (~8k document reads with the detail lookups) stays comfortably under
    // Convex's per-query limit while exceeding the size of the card catalog
    // itself, so the global oldest-first ranking below sees every owned card.
    const maxKeys = 4000;
    const keys: string[] = [];
    let cursor = "";
    while (keys.length < maxKeys) {
      const next = await ctx.db
        .query("userCards")
        .withIndex("by_cardKey", (q) => q.gt("cardKey", cursor))
        .first();
      if (!next) break;
      keys.push(next.cardKey);
      cursor = next.cardKey;
    }
    const truncated = keys.length >= maxKeys;
    const out: Array<{
      cardKey: string;
      cardName: string;
      cardIssuer: string;
      cardUrl: string | null;
      lastVerifiedAt: number | null;
    }> = [];
    for (const cardKey of keys) {
      const d = await ctx.db
        .query("cardDetails")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
        .first();
      if (!d) continue;
      out.push({
        cardKey: d.cardKey,
        cardName: d.cardName,
        cardIssuer: d.cardIssuer,
        cardUrl: d.cardUrl ?? null,
        lastVerifiedAt: d.lastVerifiedAt ?? null,
      });
    }
    out.sort((a, b) => (a.lastVerifiedAt ?? 0) - (b.lastVerifiedAt ?? 0));
    return { candidates: out.slice(0, cap), truncated };
  },
});

// Accepts one card's extraction profile (same JSON schema the daily pipeline
// prompts for — parseExtraction validates it) and runs the shared pipeline.
export const processExternalProfile = internalAction({
  args: { cardKey: v.string(), profileJson: v.string() },
  handler: async (ctx, { cardKey, profileJson }) => {
    const cfg = config();
    const detail = await ctx.runQuery(internal.freshness.getCardForFreshness, {
      cardKey,
    });
    if (!detail)
      return { ok: false, error: `no cardDetails row for '${cardKey}'` };
    const profile = parseExtraction(profileJson);
    if (!profile)
      return {
        ok: false,
        error: "profileJson did not parse as an extraction profile",
      };
    // A profile with no recognized fields must not advance the verify TTL —
    // running the pipeline on it would mark the card verified for a full TTL
    // without any data having been checked.
    const hasAnyField =
      profile.annualFee !== undefined ||
      profile.fxFee !== undefined ||
      profile.signupBonus !== undefined ||
      profile.earnCategories !== undefined ||
      profile.benefits !== undefined;
    if (!hasAnyField)
      return {
        ok: false,
        error: "profile contains no recognized fields; nothing to verify",
      };
    const selection = selectSource({
      cardUrl: detail.cardUrl,
      cardIssuer: detail.cardIssuer,
      allowlist: cfg.allowlist,
    });
    await runProfilePipeline(ctx, {
      detail,
      profile,
      selection,
      cfg,
      arrayPolicy: "review-rebuild",
    });
    return { ok: true };
  },
});

// Set the TTL marker (no changes, or couldn't verify). `verifiedAt` lets the
// caller set a short-backoff timestamp on failure instead of a full TTL.
export const markVerified = internalMutation({
  args: {
    cardKey: v.string(),
    verifiedAt: v.optional(v.number()),
    runId: v.optional(v.id("pipelineRuns")),
  },
  handler: async (ctx, { cardKey, verifiedAt, runId }) => {
    const d = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .unique();
    if (d)
      await ctx.db.patch(d._id, { lastVerifiedAt: verifiedAt ?? Date.now() });
    await bumpRun(ctx, runId, { failed: 1 });
  },
});

// Array fields (spendBonusCategory / benefit) are handled PER ITEM: each gated
// delta that passes auto-applies to a working copy; the rest are queued as one
// review row per item (add/remove/patch + item name), so a reviewer accepts or
// rejects each individually. confirmReview applies a single item delta to the
// live array. "Add everything" — no field is excluded; benefits included.
// Derived from the shared name-key map so the field list has one owner.
const ARRAY_FIELDS = new Set(Object.keys(ARRAY_FIELD_NAME_KEYS));

// Apply the auto-approved changes (when enabled), enqueue scalar changes that
// need review, and audit every gated change — all in one atomic mutation so the
// TTL never advances past a partial write. Review-loop integrity rules:
// a manually pinned field (source:"manual" provenance — a human confirmed or
// rejected a review for it) never auto-applies; a proposal identical to one a
// reviewer already rejected is suppressed (audited, not re-enqueued); pending
// reviews whose diff the model no longer proposes are retired.
export const applyFreshnessChanges = internalMutation({
  args: {
    cardKey: v.string(),
    changes: v.array(
      v.object({
        field: v.string(),
        changeType: changeTypeValidator,
        name: v.optional(v.string()),
        current: v.optional(v.any()),
        proposed: v.optional(v.any()),
        confidence: v.optional(v.number()),
        sourceUrl: v.optional(v.string()),
        autoApply: v.boolean(),
      }),
    ),
    // Fields the extraction actually reported this run (drives retirement).
    evaluatedFields: v.optional(v.array(v.string())),
    // Array fields dropped by the mass-removal guard: audited as suspect, no
    // review rows, and the card retries on the short backoff.
    suspectFields: v.optional(v.array(v.string())),
    autoEnabled: v.boolean(),
    runId: v.optional(v.id("pipelineRuns")),
  },
  handler: async (
    ctx,
    { cardKey, changes, evaluatedFields, suspectFields, autoEnabled, runId },
  ) => {
    const detail = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .unique();
    if (!detail) return;

    const now = Date.now();
    const provenance = [...(detail.fieldProvenance ?? [])];

    // Rejected rows feed value-level suppression; bounded per card.
    const reviewRows = await ctx.db
      .query("cardDataReview")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .take(500);
    const rejectedRows: RejectedRow[] = reviewRows.filter(
      (r) => r.status === "rejected",
    );
    const manualPinOf = (field: string) =>
      (detail.fieldProvenance ?? []).find(
        (p) => p.field === field && p.source === "manual",
      );
    // Keys (field + normalized item name) of reviews enqueued THIS run — the
    // retirement pass below deletes every other pending row for an evaluated
    // field, so resolved/auto-applied/suppressed proposals don't linger.
    const reviewKey = (field: string, itemName?: string) =>
      `${field}\u0000${norm(itemName ?? "")}`;
    const keepKeys = new Set<string>();
    // Whether a change (with its stored-shape proposed value) was already
    // rejected by a reviewer, or re-proposes a manually pinned value.
    const isSuppressed = (
      ch: {
        field: string;
        changeType: "patch" | "add" | "remove";
        name?: string;
      },
      storedProposed: unknown,
    ) => {
      if (
        matchesRejected(rejectedRows, {
          field: ch.field,
          name: ch.name,
          changeType: ch.changeType,
          proposed: storedProposed,
        })
      )
        return true;
      const pin = manualPinOf(ch.field);
      return (
        pin !== undefined &&
        canonicalValue(storedProposed) === canonicalValue(pin.value)
      );
    };
    const patchDoc: Record<string, unknown> = {};
    let scalarTouched = false;
    let categoriesTouched = false;
    let benefitsTouched = false;

    const upsertProv = (
      field: string,
      value: unknown,
      confidence?: number,
      sourceUrl?: string,
    ) => {
      const others = provenance.filter((p) => p.field !== field);
      others.push({
        field,
        value: value as any,
        source: "web" as const,
        confidence,
        sourceUrl,
        verifiedAt: now,
      });
      provenance.length = 0;
      provenance.push(...others);
    };

    const nameOfIn =
      (nameKeys: string[]) =>
      (item: any): string =>
        norm(
          String(nameKeys.map((k) => item?.[k]).find((x) => x != null) ?? ""),
        );

    // Enqueue a review row, replacing the matching pending one. Scalars dedupe by
    // field; array item deltas dedupe by (field, itemName) so each item is its
    // own reviewable finding.
    const enqueueReview = async (opts: {
      field: string;
      itemName?: string;
      changeType?: "patch" | "add" | "remove";
      current: unknown;
      proposed: unknown;
      confidence?: number;
      sourceUrl?: string;
      wouldAutoApply: boolean;
      note: string;
    }) => {
      // Bounded read: a card has at most a handful of rows per field (pendings
      // are replaced in place); 50 is a generous ceiling, never a full scan.
      const pending = await ctx.db
        .query("cardDataReview")
        .withIndex("by_cardKey_and_field", (q) =>
          q.eq("cardKey", cardKey).eq("field", opts.field),
        )
        .take(50);
      for (const r of pending) {
        if (r.status !== "pending") continue;
        if (opts.itemName === undefined || r.itemName === opts.itemName)
          await ctx.db.delete(r._id);
      }
      await ctx.db.insert("cardDataReview", {
        cardKey,
        field: opts.field,
        itemName: opts.itemName,
        changeType: opts.changeType,
        currentValue: opts.current as any,
        proposedValue: opts.proposed as any,
        reason: "web-correction",
        observations: [
          { source: "web", value: (opts.proposed ?? opts.current) as any },
        ],
        confidence: opts.confidence,
        sourceUrl: opts.sourceUrl,
        wouldAutoApply: opts.wouldAutoApply,
        note: opts.note,
        status: "pending",
        createdAt: now,
      });
      keepKeys.add(reviewKey(opts.field, opts.itemName));
      counters.enqueued++;
    };

    const counters = { autoApplied: 0, enqueued: 0, suppressed: 0, suspect: 0 };
    const audit = async (
      ch: any,
      mode: "auto" | "shadow" | "suppressed" | "suspect",
    ) => {
      if (mode === "auto") counters.autoApplied++;
      else if (mode === "suppressed") counters.suppressed++;
      else if (mode === "suspect") counters.suspect++;
      await ctx.db.insert("cardDataAudit", {
        cardKey,
        field: ch.field,
        changeType: ch.changeType,
        before: ch.current,
        after: ch.proposed,
        confidence: ch.confidence,
        sourceUrl: ch.sourceUrl,
        wouldAutoApply: ch.autoApply,
        mode,
        appliedAt: now,
      });
    };

    // ── Suspect array fields (mass-removal guard): one audit row per field,
    //    no review rows, and the card retries on the short backoff below. ──
    for (const field of suspectFields ?? []) {
      await audit(
        {
          field,
          changeType: "remove",
          current: (detail as any)[field],
          proposed: undefined,
        },
        "suspect",
      );
    }

    // ── Scalars: per-field auto-apply or review ──
    for (const ch of changes.filter((c) => !ARRAY_FIELDS.has(c.field))) {
      if (isSuppressed(ch, ch.proposed)) {
        await audit(ch, "suppressed");
        continue;
      }
      // Manual provenance outranks web: a human-pinned field never auto-applies
      // (and upsertProv must not replace the pin) — the change goes to review.
      const willApply =
        ch.autoApply && autoEnabled && manualPinOf(ch.field) === undefined;
      if (willApply) {
        patchDoc[ch.field] = ch.proposed;
        scalarTouched = true;
        upsertProv(ch.field, ch.proposed, ch.confidence, ch.sourceUrl);
      } else {
        await enqueueReview({
          field: ch.field,
          current: ch.current,
          proposed: ch.proposed,
          confidence: ch.confidence,
          sourceUrl: ch.sourceUrl,
          wouldAutoApply: ch.autoApply,
          note: `freshness: ${ch.changeType} ${ch.field}`,
        });
      }
      await audit(ch, willApply ? "auto" : "shadow");
    }

    // ── Array fields: per-item. Auto-apply each passing delta to a working copy;
    //    queue the rest as one review row PER item (add everything, review each). ──
    const arrayDefs = [
      { field: "spendBonusCategory", toStored: namedToCategory },
      { field: "benefit", toStored: namedToBenefit },
    ] as const;

    for (const { field, toStored } of arrayDefs) {
      const nameKeys = ARRAY_FIELD_NAME_KEYS[field];
      const chs = changes.filter((c) => c.field === field);
      if (chs.length === 0) continue;

      let working = [...(((detail as any)[field] as any[]) ?? [])];
      const nameOf = nameOfIn([...nameKeys]);
      const findStored = (name: string) =>
        working.find((i) => nameOf(i) === norm(name));
      let touched = false;

      const fieldPinned = manualPinOf(field) !== undefined;
      for (const ch of chs) {
        const storedItem =
          ch.changeType === "remove"
            ? undefined
            : toStored(ch.proposed as NamedItem);
        const existing = findStored(ch.name ?? "");

        if (isSuppressed(ch, storedItem)) {
          await audit(ch, "suppressed");
          continue;
        }
        // A human-curated (manually pinned) array field never auto-applies —
        // every delta surfaces as a review instead.
        const willApply = ch.autoApply && autoEnabled && !fieldPinned;
        if (willApply) {
          working = applyItemDelta(
            working,
            {
              changeType: ch.changeType,
              itemName: ch.name ?? "",
              item: storedItem,
            },
            [...nameKeys],
          );
          touched = true;
        } else {
          await enqueueReview({
            field,
            itemName: ch.name,
            changeType: ch.changeType,
            current: existing,
            proposed: storedItem,
            confidence: ch.confidence,
            sourceUrl: ch.sourceUrl,
            wouldAutoApply: ch.autoApply,
            note: `freshness: ${ch.changeType} ${field} "${ch.name ?? ""}"`,
          });
        }
        await audit(ch, willApply ? "auto" : "shadow");
      }

      if (touched) {
        patchDoc[field] = working;
        const rep = chs.reduce(
          (a, b) => ((b.confidence ?? 0) > (a.confidence ?? 0) ? b : a),
          chs[0],
        );
        upsertProv(field, working, rep.confidence, rep.sourceUrl);
        if (field === "benefit") benefitsTouched = true;
        else categoriesTouched = true;
      }
    }

    // ── Retire stale pendings: a pending review for an evaluated field whose
    //    (field, item) the model did NOT re-propose this run describes a diff
    //    that no longer exists (data since fixed, item auto-applied, or the
    //    extraction stopped reporting it) — delete it. Fields the model omitted
    //    are not in evaluatedFields, so their pendings are left untouched. ──
    if (evaluatedFields && evaluatedFields.length > 0) {
      const pendingNow = await ctx.db
        .query("cardDataReview")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
        .take(500);
      for (const row of pendingNow) {
        if (row.status !== "pending") continue;
        if (!evaluatedFields.includes(row.field)) continue;
        if (!keepKeys.has(reviewKey(row.field, row.itemName)))
          await ctx.db.delete(row._id);
      }
    }

    if (scalarTouched || categoriesTouched || benefitsTouched) {
      patchDoc.fieldProvenance = provenance;
    }
    // A suspect extraction doesn't earn the full TTL — retry on the short
    // failure backoff so a transient bad read heals within hours, not a week.
    if (suspectFields && suspectFields.length > 0) {
      const cfg = config();
      patchDoc.lastVerifiedAt = now - cfg.ttlMs + cfg.failureRetryMs;
    } else {
      patchDoc.lastVerifiedAt = now;
    }
    await ctx.db.patch(detail._id, patchDoc as Record<string, unknown>);

    await bumpRun(ctx, runId, { extracted: 1, ...counters });

    if (scalarTouched || categoriesTouched || benefitsTouched) {
      await ctx.scheduler.runAfter(0, internal.offers.rescanCard, { cardKey });
    }
    if (benefitsTouched) {
      await ctx.scheduler.runAfter(0, internal.benefits.seedOwnersForCard, {
        cardKey,
      });
    }
  },
});

// Admin-triggered: verify every card in the caller's wallet now, AWAITING all
// checks so the caller's promise resolves only when done — the review screen can
// show a spinner for the whole run instead of returning immediately. Runs in
// bounded chunks so a large wallet doesn't burst concurrent LLM calls.
export const verifyMyWallet = action({
  args: {},
  handler: async (ctx): Promise<{ cardCount: number }> => {
    const subject = await requireAdmin(ctx);
    const cfg = config();
    const cardKeys: string[] = await ctx.runQuery(
      internal.freshness.getUserCardKeys,
      { userId: subject },
    );
    const runId = await ctx.runMutation(internal.freshness.startRun, {
      source: "manual",
    });
    await ctx.runMutation(internal.freshness.bumpRunCounters, {
      runId,
      deltas: { scheduled: cardKeys.length },
    });
    // allSettled + finally: one card throwing hard (e.g. OCC retry exhaustion
    // under chunk concurrency) must not abort the remaining chunks or leave the
    // run row unfinalized — count it as failed and keep going.
    try {
      for (let i = 0; i < cardKeys.length; i += cfg.walletConcurrency) {
        const chunk = cardKeys.slice(i, i + cfg.walletConcurrency);
        const results = await Promise.allSettled(
          chunk.map((cardKey) =>
            ctx.runAction(internal.freshness.verifyOneCard, { cardKey, runId }),
          ),
        );
        let failed = 0;
        results.forEach((r, j) => {
          if (r.status === "rejected") {
            failed++;
            console.error(`verifyMyWallet: '${chunk[j]}' failed`, r.reason);
          }
        });
        if (failed > 0) {
          await ctx.runMutation(internal.freshness.bumpRunCounters, {
            runId,
            deltas: { failed },
          });
        }
      }
    } finally {
      await ctx.runMutation(internal.freshness.finishRun, { runId });
    }
    return { cardCount: cardKeys.length };
  },
});

// ── Daily batch driver ───────────────────────────────────────────────────────
// Self-chaining (mirrors rapidapi.refreshStaleDetails): each invocation claims
// the next most-overdue batch, schedules the per-card verifications staggered
// by callSpacingMs (no concurrent burst at OpenRouter), and re-schedules itself
// while full batches keep coming — bounded by the dailyCap LLM-call budget.
export const verifyWalletBatch = internalAction({
  args: {
    processed: v.optional(v.number()),
    runId: v.optional(v.id("pipelineRuns")),
  },
  handler: async (ctx, { processed, runId }) => {
    const cfg = config();
    const done = processed ?? 0;
    const batch = planBatch(done, cfg.dailyCap, cfg.perRunCap);
    if (batch <= 0) {
      if (runId) await ctx.runMutation(internal.freshness.finishRun, { runId });
      console.info(`freshness: daily cap reached after ${done} card(s)`);
      return;
    }

    const run =
      runId ??
      (await ctx.runMutation(internal.freshness.startRun, { source: "cron" }));
    const { cardKeys } = await ctx.runMutation(
      internal.freshness.claimDueCards,
      { limit: batch, ttlMs: cfg.ttlMs, retryMs: cfg.failureRetryMs },
    );
    for (let i = 0; i < cardKeys.length; i++) {
      await ctx.scheduler.runAfter(
        i * cfg.callSpacingMs,
        internal.freshness.verifyOneCard,
        { cardKey: cardKeys[i], runId: run },
      );
    }
    if (cardKeys.length > 0) {
      await ctx.runMutation(internal.freshness.bumpRunCounters, {
        runId: run,
        deltas: { scheduled: cardKeys.length },
      });
      console.info(
        `freshness: scheduled ${cardKeys.length} card verification(s)`,
      );
    }

    if (cardKeys.length === batch) {
      // A full batch — more may be due. Chain after the batch has drained.
      await ctx.scheduler.runAfter(
        cardKeys.length * cfg.callSpacingMs + 30_000,
        internal.freshness.verifyWalletBatch,
        { processed: done + cardKeys.length, runId: run },
      );
    } else {
      await ctx.runMutation(internal.freshness.finishRun, { runId: run });
    }
  },
});
