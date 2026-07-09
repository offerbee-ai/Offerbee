import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { missingEnvVariableUrl } from "./utils";

// Cross-checks each tracked card field against a second free data source
// (andenacitelli/credit-card-bonuses-api) and, on disagreement or a
// single-source field, verifies the truth via an LLM web search against the
// issuer. Confirmed corrections land in the cardDataReview queue for a human.
//
// Non-commercial use only: the GitHub source is MIT + Commons Clause. Fine for
// a personal project; revisit before any commercial launch. See project notes.

const GITHUB_DATA_URL =
  "https://raw.githubusercontent.com/andenacitelli/credit-card-bonuses-api/main/exports/data.json";
// Web verification goes through OpenRouter (OpenAI-compatible chat completions)
// with its server-side "web" search plugin, so any model can search the web.
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_SIGNUP_URL = "https://openrouter.ai/keys";
const DEFAULT_MODEL = "anthropic/claude-sonnet-5";

// ── Coercion (mirrors rapidapi.ts; both sources are loosely typed) ──────────
function toNum(x: unknown): number | undefined {
  if (typeof x === "number") return Number.isFinite(x) ? x : undefined;
  if (typeof x === "string") {
    const n = parseFloat(x.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// The fields we cross-check, and how to read each from the two sources.
type FieldSpec = {
  field: string; // cardDetails key
  label: string; // human phrasing for the web-verify prompt
  fromDetail: (d: any) => number | undefined;
  fromGithub: (g: GithubCard) => number | undefined;
};

type GithubCard = {
  name: string;
  issuer: string;
  annualFee?: number;
  discontinued?: boolean;
  offers?: Array<{ spend?: number; amount?: Array<{ amount?: number }> }>;
};

function currentOffer(g: GithubCard) {
  return Array.isArray(g.offers) && g.offers.length > 0 ? g.offers[0] : null;
}

const FIELD_SPECS: FieldSpec[] = [
  {
    field: "annualFee",
    label: "annual fee (in US dollars)",
    fromDetail: (d) => toNum(d?.annualFee),
    fromGithub: (g) => toNum(g.annualFee),
  },
  {
    field: "signupBonusAmount",
    label: "current sign-up bonus amount (points/miles, or dollars if cashback)",
    fromDetail: (d) => toNum(d?.signupBonusAmount),
    fromGithub: (g) => toNum(currentOffer(g)?.amount?.[0]?.amount),
  },
  {
    field: "signupBonusSpend",
    label: "minimum spend required to earn the current sign-up bonus (US dollars)",
    fromDetail: (d) => toNum(d?.signupBonusSpend),
    fromGithub: (g) => toNum(currentOffer(g)?.spend),
  },
];

// ── GitHub source matching ──────────────────────────────────────────────────
const NAME_STOPWORDS = new Set([
  "the", "card", "credit", "from", "for", "exclusively", "℠", "®", "™",
  "american", "express", "visa", "mastercard", "amex", "signature",
]);

function normIssuer(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function nameTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !NAME_STOPWORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// Best-effort match of a rapidapi card to a GitHub record. Returns null unless
// the issuer matches and the names are strongly similar — we prefer "no second
// source" (→ web verify) over a wrong match.
function matchGithub(
  detail: { cardName: string; cardIssuer: string },
  rows: GithubCard[],
): GithubCard | null {
  const wantIssuer = normIssuer(detail.cardIssuer);
  const wantName = nameTokens(detail.cardName);
  let best: GithubCard | null = null;
  let bestScore = 0;
  for (const g of rows) {
    if (g.discontinued) continue;
    if (normIssuer(g.issuer) !== wantIssuer) continue;
    const score = jaccard(wantName, nameTokens(g.name));
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

async function fetchGithub(): Promise<GithubCard[]> {
  const res = await fetch(GITHUB_DATA_URL);
  if (!res.ok) throw new Error(`github data HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? (body as GithubCard[]) : [];
}

// ── LLM web verification ─────────────────────────────────────────────────────
type WebResult = {
  value: number | null;
  sourceUrl: string | null;
  confidence: number;
  note: string;
} | null;

// Ask Claude to find the field's current value from the issuer's own page.
// Returns null if the API key is absent or the call/parse fails.
async function webVerify(
  cardName: string,
  cardIssuer: string,
  label: string,
): Promise<WebResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error(
      missingEnvVariableUrl("OPENROUTER_API_KEY", OPENROUTER_SIGNUP_URL),
    );
    return null;
  }
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const prompt =
    `What is the ${label} for the "${cardName}" credit card issued by ${cardIssuer}, ` +
    `as of today? Search the web and prefer the issuer's own official page. ` +
    `Reply with ONLY a JSON object, no prose, of the form ` +
    `{"value": <number or null>, "sourceUrl": "<url>", "confidence": <0-1>, "note": "<short justification>"}. ` +
    `Use null for value if you cannot find it confidently.`;

  try {
    // Raw fetch (not an SDK): Convex's default runtime is a V8 isolate, and
    // rapidapi.ts already calls external APIs this way. OpenRouter's "web"
    // plugin runs the search server-side, so a single round trip suffices.
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
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      value: toNum(parsed.value) ?? null,
      sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : null,
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      note: typeof parsed.note === "string" ? parsed.note.slice(0, 500) : "",
    };
  } catch (e) {
    console.error("Web verification failed", e);
    return null;
  }
}

// Read the fields we need off the cached detail (internal — no auth surface).
export const getDetailForVerify = internalQuery({
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
      annualFee: d.annualFee,
      signupBonusAmount: d.signupBonusAmount,
      signupBonusSpend: d.signupBonusSpend,
    };
  },
});

// ── The pipeline: cross-check a card, verify disagreements, queue reviews. ──
export const crossCheckCard = internalAction({
  args: { cardKey: v.string() },
  handler: async (ctx, { cardKey }) => {
    const detail = await ctx.runQuery(internal.verify.getDetailForVerify, {
      cardKey,
    });
    if (!detail) return;

    let github: GithubCard | null = null;
    try {
      github = matchGithub(detail, await fetchGithub());
    } catch (e) {
      console.error("GitHub cross-check source unavailable", e);
    }

    const now = Date.now();
    for (const spec of FIELD_SPECS) {
      const rapid = spec.fromDetail(detail);
      if (rapid === undefined) continue; // nothing cached to check
      const gh = github ? spec.fromGithub(github) : undefined;

      const agree = gh !== undefined && gh === rapid;
      if (agree) {
        // Two independent sources concur — trust it, no human needed.
        await ctx.runMutation(internal.review.recordProvenance, {
          cardKey,
          entry: {
            field: spec.field,
            value: rapid,
            source: "github",
            confidence: 0.9,
            verifiedAt: now,
          },
        });
        continue;
      }

      const reason =
        gh === undefined ? ("single-source" as const) : ("source-mismatch" as const);
      const observations = [
        { source: "rapidapi" as const, value: rapid },
        ...(gh !== undefined
          ? [{ source: "github" as const, value: gh }]
          : []),
      ];

      const web = await webVerify(detail.cardName, detail.cardIssuer, spec.label);

      if (web && web.value !== null) {
        if (web.value === rapid) {
          // Web agreed with what we have — record trust, no review.
          await ctx.runMutation(internal.review.recordProvenance, {
            cardKey,
            entry: {
              field: spec.field,
              value: rapid,
              source: "web",
              confidence: web.confidence,
              sourceUrl: web.sourceUrl ?? undefined,
              verifiedAt: now,
            },
          });
          continue;
        }
        // Web found a different value — propose the correction for confirmation.
        await ctx.runMutation(internal.review.enqueueReview, {
          cardKey,
          field: spec.field,
          currentValue: rapid,
          proposedValue: web.value,
          reason,
          observations: [...observations, { source: "web", value: web.value }],
          confidence: web.confidence,
          sourceUrl: web.sourceUrl ?? undefined,
          note: web.note,
          createdAt: now,
        });
        continue;
      }

      // No web answer available.
      if (reason === "source-mismatch") {
        // Two sources disagree and we can't break the tie automatically —
        // surface it with the GitHub value as the candidate.
        await ctx.runMutation(internal.review.enqueueReview, {
          cardKey,
          field: spec.field,
          currentValue: rapid,
          proposedValue: gh,
          reason,
          observations,
          note: "Sources disagree; web verification unavailable.",
          createdAt: now,
        });
      } else {
        // Single source, unverifiable — record low confidence, don't flood the
        // queue (the periodic sweep will retry once a key is configured).
        await ctx.runMutation(internal.review.recordProvenance, {
          cardKey,
          entry: {
            field: spec.field,
            value: rapid,
            source: "rapidapi",
            confidence: 0.5,
            verifiedAt: now,
          },
        });
      }
    }
  },
});

// ── Periodic re-verification: re-run the cross-check on the least-recently
//    verified cached cards, so stale values eventually get caught. ──
export const reverifySweep = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const stale = await ctx.runQuery(
      internal.verify.getCardsToReverify,
      { limit: limit ?? 10 },
    );
    for (const cardKey of stale) {
      await ctx.runAction(internal.verify.crossCheckCard, { cardKey });
    }
  },
});

// Cards whose provenance is missing or lowest-confidence, oldest detail first.
export const getCardsToReverify = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const details = await ctx.db
      .query("cardDetails")
      .withIndex("by_detailFetchedAt")
      .order("asc")
      .take(200);
    const ranked = details
      .map((d) => {
        const prov = d.fieldProvenance ?? [];
        const minConf = prov.length
          ? Math.min(...prov.map((p) => p.confidence ?? 0))
          : 0;
        return { cardKey: d.cardKey, hasProv: prov.length > 0, minConf };
      })
      // Unverified first, then lowest-confidence.
      .sort((a, b) =>
        a.hasProv === b.hasProv ? a.minConf - b.minConf : a.hasProv ? 1 : -1,
      );
    return ranked.slice(0, limit).map((r) => r.cardKey);
  },
});
