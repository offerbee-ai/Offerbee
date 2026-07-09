import {
  action,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { missingEnvVariableUrl } from "./utils";

// User-initiated data verification. For each tracked field of a card, we ask an
// LLM (via OpenRouter) to look up the current value on the web — preferring the
// issuer's own page — and compare it to what the Rewards CC API gave us. A
// confident web value that differs is proposed as a correction in the
// cardDataReview queue for a human to confirm. Nothing runs automatically:
// the user starts a run from the Review screen (startForMyCards).
//
// (Future: drive this agentically via the Claude cowork feature.)

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_SIGNUP_URL = "https://openrouter.ai/keys";
const DEFAULT_MODEL = "anthropic/claude-sonnet-5";

// ── Coercion (the Rewards CC API is loosely typed) ──────────────────────────
function toNum(x: unknown): number | undefined {
  if (typeof x === "number") return Number.isFinite(x) ? x : undefined;
  if (typeof x === "string") {
    const n = parseFloat(x.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// The fields we verify, and how to read each from the cached detail.
type FieldSpec = {
  field: string; // cardDetails key
  label: string; // human phrasing for the web-verify prompt
  fromDetail: (d: any) => number | undefined;
};

const FIELD_SPECS: FieldSpec[] = [
  {
    field: "annualFee",
    label: "annual fee (in US dollars)",
    fromDetail: (d) => toNum(d?.annualFee),
  },
  {
    field: "signupBonusAmount",
    label: "current sign-up bonus amount (points/miles, or dollars if cashback)",
    fromDetail: (d) => toNum(d?.signupBonusAmount),
  },
  {
    field: "signupBonusSpend",
    label: "minimum spend required to earn the current sign-up bonus (US dollars)",
    fromDetail: (d) => toNum(d?.signupBonusSpend),
  },
];

// ── LLM web verification (OpenRouter, OpenAI-compatible, "web" plugin) ───────
type WebResult = {
  value: number | null;
  sourceUrl: string | null;
  confidence: number;
  note: string;
} | null;

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

// The cardKeys in a user's wallet (for a user-initiated verification run).
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

// ── Verify one card: web-check each field against the API value. ────────────
export const crossCheckCard = internalAction({
  args: { cardKey: v.string() },
  handler: async (ctx, { cardKey }) => {
    const detail = await ctx.runQuery(internal.verify.getDetailForVerify, {
      cardKey,
    });
    if (!detail) return;

    const now = Date.now();
    for (const spec of FIELD_SPECS) {
      const current = spec.fromDetail(detail);
      if (current === undefined) continue; // nothing cached to verify

      const web = await webVerify(detail.cardName, detail.cardIssuer, spec.label);

      if (!web || web.value === null) {
        // Couldn't verify — record what we have at low confidence and clear any
        // stale pending review (with no second source, we can't assert a fix).
        await ctx.runMutation(internal.review.recordProvenance, {
          cardKey,
          entry: {
            field: spec.field,
            value: current,
            source: "rapidapi",
            confidence: 0.4,
            verifiedAt: now,
          },
        });
        continue;
      }

      if (web.value === current) {
        // Web confirms the API value — trust it, no review.
        await ctx.runMutation(internal.review.recordProvenance, {
          cardKey,
          entry: {
            field: spec.field,
            value: current,
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
        currentValue: current,
        proposedValue: web.value,
        reason: "web-correction",
        observations: [
          { source: "rapidapi", value: current },
          { source: "web", value: web.value },
        ],
        confidence: web.confidence,
        sourceUrl: web.sourceUrl ?? undefined,
        note: web.note,
        createdAt: now,
      });
    }
  },
});

// ── User-initiated entry point: verify every card in the caller's wallet. ──
// Schedules the per-card checks so the call returns immediately; the review
// queue populates reactively as each web check finishes.
export const startForMyCards = action({
  args: {},
  handler: async (ctx): Promise<{ cardCount: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required to verify cards");
    const cardKeys = await ctx.runQuery(internal.verify.getUserCardKeys, {
      userId: identity.subject,
    });
    for (const cardKey of cardKeys) {
      await ctx.scheduler.runAfter(0, internal.verify.crossCheckCard, {
        cardKey,
      });
    }
    return { cardCount: cardKeys.length };
  },
});
