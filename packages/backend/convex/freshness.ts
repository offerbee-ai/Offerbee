import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { missingEnvVariableUrl } from "./utils";
import { selectSource } from "./cardSourceSelect";
import { parseExtraction } from "./cardExtractionParse";
import { diffScalar, diffNamedArray, type NamedItem } from "./cardDataDiff";
import { gateChange } from "./autoApplyGate";
import {
  categoryToNamed,
  namedToCategory,
  benefitToNamed,
  namedToBenefit,
} from "./cardFieldMap";

// Daily card-data freshness pipeline. For each card in a user's wallet that is
// past its verify TTL, ask an LLM (OpenRouter, deepseek default) to read the
// current terms from the web — preferring the card's official issuer page — and
// diff them against what we store. Confident, cited, in-bounds changes are
// auto-applied (fees, earn categories, benefits); everything else falls back to
// the human review queue. AUTO_APPLY_ENABLED gates whether confident changes are
// actually written ("shadow" mode records them for measurement instead). The
// per-card TTL is tracked by cardDetails.lastVerifiedAt. See
// docs/plans/2026-07-22-auto-card-data-freshness-plan.md.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_SIGNUP_URL = "https://openrouter.ai/keys";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

const DEFAULT_ALLOWLIST = [
  "americanexpress.com",
  "chase.com",
  "citi.com",
  "bankofamerica.com",
  "capitalone.com",
  "wellsfargo.com",
  "discover.com",
  "usbank.com",
  "barclaycardus.com",
  "biltrewards.com",
];

const changeTypeValidator = v.union(
  v.literal("patch"),
  v.literal("add"),
  v.literal("remove"),
);

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
    // Off by default: first deploy runs in shadow (record, don't write).
    autoApplyEnabled: process.env.AUTO_APPLY_ENABLED === "true",
    allowlist: (process.env.ISSUER_DOMAIN_ALLOWLIST
      ? process.env.ISSUER_DOMAIN_ALLOWLIST.split(",").map((s: string) => s.trim())
      : DEFAULT_ALLOWLIST
    ).filter(Boolean),
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
      spendBonusCategory: d.spendBonusCategory ?? [],
      benefit: d.benefit ?? [],
    };
  },
});

// Wallet cardKeys due for re-verification, OLDEST-verified first. Walking the
// by_lastVerifiedAt index ascending means never-verified rows come first, then
// the stalest — so cards rotate through and none is permanently starved. We stop
// as soon as we reach a card still within TTL (all later ones are fresher) or
// hit the scan cap. Only owned cards (userCards.by_cardKey) are returned.
export const getWalletCardsDue = internalQuery({
  args: { ttlMs: v.number(), limit: v.number() },
  handler: async (ctx, { ttlMs, limit }) => {
    const cutoff = Date.now() - ttlMs;
    const due: string[] = [];
    let scanned = 0;
    for await (const d of ctx.db
      .query("cardDetails")
      .withIndex("by_lastVerifiedAt")
      .order("asc")) {
      if (due.length >= limit || scanned >= 2000) break;
      scanned++;
      // Ascending: once we reach a card still inside its TTL, the rest are too.
      if (d.lastVerifiedAt !== undefined && d.lastVerifiedAt >= cutoff) break;
      const owned = await ctx.db
        .query("userCards")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", d.cardKey))
        .first();
      if (owned) due.push(d.cardKey);
    }
    return due;
  },
});

// ── LLM extraction ─────────────────────────────────────────────────────────
async function extractProfile(
  cardName: string,
  cardIssuer: string,
  sourceHint: string | undefined,
  model: string,
): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error(
      missingEnvVariableUrl("OPENROUTER_API_KEY", OPENROUTER_SIGNUP_URL),
    );
    return null;
  }
  const source = sourceHint
    ? `Prefer this official page: ${sourceHint}. `
    : `Search the web and prefer the issuer's own official page. `;
  const prompt =
    `Extract the current rewards terms for the "${cardName}" credit card issued by ${cardIssuer}, as of today. ` +
    source +
    `Report the issuer's standard US consumer terms. Reply with ONLY a JSON object, no prose:\n` +
    `{"annualFee":{"value":<number>,"confidence":<0-1>,"sourceUrl":"<url>"},` +
    `"earnCategories":[{"name":"<category>","multiplier":<number>,"spendLimit":<number or 0>,"desc":"<short>","confidence":<0-1>,"sourceUrl":"<url>"}],` +
    `"benefits":[{"title":"<benefit>","desc":"<short>","confidence":<0-1>,"sourceUrl":"<url>"}]}. ` +
    `multiplier is the cash-back % or points-per-dollar. Set confidence low if the page is ambiguous or not the issuer's own.`;
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        plugins: [{ id: "web", max_results: 5 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`openrouter HTTP ${res.status}`);
    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error(`Freshness extraction failed for '${cardName}'`, e);
    return null;
  }
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

// Verify one card end-to-end.
export const verifyOneCard = internalAction({
  args: { cardKey: v.string() },
  handler: async (ctx, { cardKey }) => {
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
    const raw = await extractProfile(
      detail.cardName,
      detail.cardIssuer,
      selection.mode === "issuer-url" ? selection.url : undefined,
      cfg.model,
    );
    const profile = raw ? parseExtraction(raw) : null;
    if (!profile) {
      // Extraction failed (no key / API error / unparseable). Do NOT consume the
      // full TTL — set a short backoff so a transient failure retries soon.
      await ctx.runMutation(internal.freshness.markVerified, {
        cardKey,
        verifiedAt: Date.now() - cfg.ttlMs + cfg.failureRetryMs,
      });
      return;
    }

    const gateCfg = {
      confidenceThreshold: cfg.confidenceThreshold,
      cardIssuer: detail.cardIssuer,
      allowlist: cfg.allowlist,
    };
    const changes: PipelineChange[] = [];

    // Scalar: annual fee.
    if (profile.annualFee !== undefined) {
      const sc = diffScalar(
        "annualFee",
        detail.annualFee,
        profile.annualFee,
        profile.annualFeeConfidence ?? 0,
        profile.annualFeeSourceUrl ?? selection.url,
      );
      if (sc) changes.push({ ...sc, autoApply: gateChange(sc, gateCfg).autoApply });
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
      for (const c of diffNamedArray(field, current, proposed)) {
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
        change.autoApply = gateChange(change, gateCfg).autoApply;
        changes.push(change);
      }
    }

    // One atomic mutation: apply auto-approved changes, enqueue the rest for
    // review, audit everything, and advance the TTL — no partial-write window.
    await ctx.runMutation(internal.freshness.applyFreshnessChanges, {
      cardKey,
      changes,
      autoEnabled: cfg.autoApplyEnabled,
    });
  },
});

// Set the TTL marker (no changes, or couldn't verify). `verifiedAt` lets the
// caller set a short-backoff timestamp on failure instead of a full TTL.
export const markVerified = internalMutation({
  args: { cardKey: v.string(), verifiedAt: v.optional(v.number()) },
  handler: async (ctx, { cardKey, verifiedAt }) => {
    const d = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .unique();
    if (d) await ctx.db.patch(d._id, { lastVerifiedAt: verifiedAt ?? Date.now() });
  },
});

// Array fields hold whole-array corrections; the scalar-shaped review queue
// (and confirmReview) can't represent a single-item delta, so those are
// auto-apply-only (gated + audited). Scalars route to the human review queue.
const ARRAY_FIELDS = new Set(["spendBonusCategory", "benefit"]);

// Apply the auto-approved changes (when enabled), enqueue scalar changes that
// need review, and audit every gated change — all in one atomic mutation so the
// TTL never advances past a partial write.
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
    autoEnabled: v.boolean(),
  },
  handler: async (ctx, { cardKey, changes, autoEnabled }) => {
    const detail = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .unique();
    if (!detail) return;

    const now = Date.now();
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

    let categories = [...(detail.spendBonusCategory ?? [])] as any[];
    let benefits = [...(detail.benefit ?? [])] as any[];
    let categoriesTouched = false;
    let benefitsTouched = false;
    let scalarTouched = false;
    const patchDoc: Record<string, unknown> = {};
    const provenance = [...(detail.fieldProvenance ?? [])];

    const upsertProv = (field: string, value: unknown, ch: any) => {
      const others = provenance.filter((p) => p.field !== field);
      others.push({
        field,
        value: value as any,
        source: "web" as const,
        confidence: ch.confidence,
        sourceUrl: ch.sourceUrl,
        verifiedAt: now,
      });
      provenance.length = 0;
      provenance.push(...others);
    };

    const applyArrayOp = (
      arr: any[],
      ch: any,
      toStored: (n: NamedItem) => Record<string, unknown>,
      nameKeys: string[],
    ): any[] => {
      const nameOf = (item: any) =>
        norm(String(nameKeys.map((k) => item?.[k]).find((x) => x != null) ?? ""));
      const key = norm(ch.name ?? "");
      if (ch.changeType === "remove")
        return arr.filter((i) => nameOf(i) !== key);
      const mapped = toStored(ch.proposed as NamedItem);
      if (ch.changeType === "add") return [...arr, mapped];
      // patch: merge over the existing item so LLM-omitted fields survive.
      return arr.map((i) => (nameOf(i) === key ? { ...i, ...mapped } : i));
    };

    for (const ch of changes) {
      const willApply = ch.autoApply && autoEnabled;
      const mode = willApply ? "auto" : "shadow";

      if (willApply) {
        if (ch.field === "annualFee") {
          patchDoc.annualFee = ch.proposed;
          scalarTouched = true;
          upsertProv("annualFee", ch.proposed, ch);
        } else if (ch.field === "spendBonusCategory") {
          categories = applyArrayOp(categories, ch, namedToCategory, [
            "spendBonusCategoryName",
            "spendBonusCategoryType",
          ]);
          categoriesTouched = true;
        } else if (ch.field === "benefit") {
          benefits = applyArrayOp(benefits, ch, namedToBenefit, ["benefitTitle"]);
          benefitsTouched = true;
        }
      } else if (!ARRAY_FIELDS.has(ch.field)) {
        // Scalar not auto-applied → human review queue (dedupe pending per field).
        const pending = await ctx.db
          .query("cardDataReview")
          .withIndex("by_cardKey_and_field", (q) =>
            q.eq("cardKey", cardKey).eq("field", ch.field),
          )
          .collect();
        for (const r of pending) {
          if (r.status === "pending") await ctx.db.delete(r._id);
        }
        await ctx.db.insert("cardDataReview", {
          cardKey,
          field: ch.field,
          currentValue: ch.current as any,
          proposedValue: ch.proposed as any,
          reason: "web-correction",
          observations: [{ source: "web", value: ch.proposed as any }],
          confidence: ch.confidence,
          sourceUrl: ch.sourceUrl,
          note: `freshness: ${ch.changeType} ${ch.field}`,
          status: "pending",
          createdAt: now,
        });
      }
      // (Array changes not auto-applied are recorded in the audit only.)

      await ctx.db.insert("cardDataAudit", {
        cardKey,
        field: ch.field,
        changeType: ch.changeType,
        before: ch.current,
        after: ch.proposed,
        confidence: ch.confidence,
        sourceUrl: ch.sourceUrl,
        mode,
        appliedAt: now,
      });
    }

    if (categoriesTouched) {
      patchDoc.spendBonusCategory = categories;
      upsertProv("spendBonusCategory", categories, {});
    }
    if (benefitsTouched) {
      patchDoc.benefit = benefits;
      upsertProv("benefit", benefits, {});
    }

    if (scalarTouched || categoriesTouched || benefitsTouched) {
      patchDoc.fieldProvenance = provenance;
    }
    patchDoc.lastVerifiedAt = now;
    await ctx.db.patch(detail._id, patchDoc as Record<string, unknown>);

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

// ── Daily batch driver ───────────────────────────────────────────────────────
export const verifyWalletBatch = internalAction({
  args: {},
  handler: async (ctx) => {
    const cfg = config();
    const due = await ctx.runQuery(internal.freshness.getWalletCardsDue, {
      ttlMs: cfg.ttlMs,
      limit: cfg.perRunCap,
    });
    for (const cardKey of due) {
      await ctx.scheduler.runAfter(0, internal.freshness.verifyOneCard, {
        cardKey,
      });
    }
    if (due.length > 0) {
      console.info(`freshness: scheduled ${due.length} card verification(s)`);
    }
  },
});
