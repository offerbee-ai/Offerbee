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
    perRunCap: num("FRESHNESS_PER_RUN_CAP", 25),
    // Off by default: first deploy runs in shadow (record, don't write).
    autoApplyEnabled: process.env.AUTO_APPLY_ENABLED === "true",
    allowlist: (process.env.ISSUER_DOMAIN_ALLOWLIST
      ? process.env.ISSUER_DOMAIN_ALLOWLIST.split(",").map((s) => s.trim())
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

// Distinct wallet cardKeys due for re-verification (missing or past TTL).
// Bounded scan on both sides so one run stays cheap.
export const getWalletCardsDue = internalQuery({
  args: { ttlMs: v.number(), limit: v.number() },
  handler: async (ctx, { ttlMs, limit }) => {
    const now = Date.now();
    const owned = await ctx.db.query("userCards").take(3000);
    const seen = new Set<string>();
    const due: string[] = [];
    let scanned = 0;
    for (const uc of owned) {
      if (seen.has(uc.cardKey)) continue;
      seen.add(uc.cardKey);
      if (scanned >= 500 || due.length >= limit) break;
      scanned++;
      const detail = await ctx.db
        .query("cardDetails")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", uc.cardKey))
        .unique();
      const last = detail?.lastVerifiedAt;
      if (last === undefined || last < now - ttlMs) due.push(uc.cardKey);
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
      // Couldn't verify — stamp the TTL so we don't retry-storm this card.
      await ctx.runMutation(internal.freshness.markVerified, { cardKey });
      return;
    }

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
      if (sc) {
        const gate = gateChange(sc, {
          confidenceThreshold: cfg.confidenceThreshold,
        });
        changes.push({ ...sc, autoApply: gate.autoApply });
      }
    }

    // Arrays: earn categories + benefits, normalized to named items.
    const arrayDiffs: Array<[string, NamedItem[], NamedItem[]]> = [
      [
        "spendBonusCategory",
        detail.spendBonusCategory.map(categoryToNamed),
        profile.earnCategories,
      ],
      ["benefit", detail.benefit.map(benefitToNamed), profile.benefits],
    ];
    for (const [field, current, proposed] of arrayDiffs) {
      for (const c of diffNamedArray(field, current, proposed)) {
        const gate = gateChange(c as any, {
          confidenceThreshold: cfg.confidenceThreshold,
        });
        changes.push({
          field: c.field,
          changeType: c.changeType,
          name: c.name,
          current: "current" in c ? c.current : undefined,
          proposed: "proposed" in c ? c.proposed : undefined,
          confidence:
            "proposed" in c && c.proposed
              ? (c.proposed as any).confidence
              : undefined,
          sourceUrl:
            "proposed" in c && c.proposed
              ? (c.proposed as any).sourceUrl
              : undefined,
          autoApply: gate.autoApply,
        });
      }
    }

    if (changes.length === 0) {
      await ctx.runMutation(internal.freshness.markVerified, { cardKey });
      return;
    }

    const needReview = await ctx.runMutation(
      internal.freshness.applyFreshnessChanges,
      { cardKey, changes, autoEnabled: cfg.autoApplyEnabled },
    );

    // Route the rest (or all, in shadow mode) to the human review queue.
    const now = Date.now();
    for (const ch of needReview) {
      await ctx.runMutation(internal.review.enqueueReview, {
        cardKey,
        field: ch.field,
        currentValue: ch.current as any,
        proposedValue: ch.proposed as any,
        reason: "web-correction",
        observations: [{ source: "web", value: ch.proposed as any }],
        confidence: ch.confidence,
        sourceUrl: ch.sourceUrl,
        note: `freshness: ${ch.changeType} ${ch.field}${ch.name ? ` (${ch.name})` : ""}`,
        createdAt: now,
      });
    }
  },
});

// Bump only the TTL marker (no changes / couldn't verify).
export const markVerified = internalMutation({
  args: { cardKey: v.string() },
  handler: async (ctx, { cardKey }) => {
    const d = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .unique();
    if (d) await ctx.db.patch(d._id, { lastVerifiedAt: Date.now() });
  },
});

// Apply the auto-approved changes (when enabled), audit every gated change, and
// return the changes that still need human review.
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
    if (!detail) return [] as PipelineChange[];

    const now = Date.now();
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

    let categories = [...(detail.spendBonusCategory ?? [])] as any[];
    let benefits = [...(detail.benefit ?? [])] as any[];
    let categoriesTouched = false;
    let benefitsTouched = false;
    let scalarTouched = false;
    const patchDoc: Record<string, unknown> = {};
    const provenance = [...(detail.fieldProvenance ?? [])];
    const needReview: PipelineChange[] = [];

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
      } else {
        needReview.push(ch);
      }

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

    return needReview;
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
