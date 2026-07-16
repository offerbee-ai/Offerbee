import { missingEnvVariableUrl } from "./utils";

// Step-2 "smart filtering": ask an LLM (OpenRouter, reusing verify.ts's pattern)
// to map ambiguous candidate transactions to the credit they plausibly used,
// given the card's benefits + remaining allowance this period. Pure helper —
// called from the syncItem action. No Convex imports; no web plugin.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_SIGNUP_URL = "https://openrouter.ai/keys";
const DEFAULT_MODEL = "anthropic/claude-sonnet-5";
const CONFIDENCE_THRESHOLD = 0.6;

export type LlmBenefit = {
  id: string; // Id<"userBenefits"> as a string
  title: string;
  cycle: string;
  amount: number;
  remaining: number; // remaining allowance this period
};

export type LlmCandidate = {
  transactionId: string;
  merchantName?: string;
  name?: string;
  originalDescription?: string; // raw statement text, when Plaid provides it
  amount: number; // negative = statement credit, positive = purchase
  date: number;
  pfcPrimary?: string;
};

// Returns one entry per candidate ({benefitId or null}) on success, or null when
// the LLM couldn't run (missing key / error) so callers leave candidates pending.
export async function llmClassify(
  cardName: string,
  benefits: LlmBenefit[],
  candidates: LlmCandidate[],
): Promise<{ transactionId: string; benefitId: string | null }[] | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error(
      missingEnvVariableUrl("OPENROUTER_API_KEY", OPENROUTER_SIGNUP_URL),
    );
    return null;
  }
  if (candidates.length === 0) return [];
  if (benefits.length === 0)
    return candidates.map((c) => ({ transactionId: c.transactionId, benefitId: null }));

  // Classification is simpler than verify.ts's web-check, so allow a dedicated
  // (cheaper) model via PLAID_LLM_MODEL, falling back to the shared OPENROUTER_MODEL.
  const model =
    process.env.PLAID_LLM_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const benefitList = benefits
    .map(
      (b, i) =>
        `${i}: "${b.title}" (${b.cycle}, $${b.amount}/period, $${b.remaining} remaining this period)`,
    )
    .join("\n");
  const txnList = candidates
    .map(
      (c) =>
        `${c.transactionId}: ${c.merchantName ?? c.name ?? "?"} $${Math.abs(c.amount)} ` +
        `${c.amount < 0 ? "(credit/refund)" : "(purchase)"} ` +
        `${new Date(c.date).toISOString().slice(0, 10)} [${c.pfcPrimary ?? "?"}]` +
        (c.originalDescription ? ` raw="${c.originalDescription}"` : ""),
    )
    .join("\n");

  const prompt =
    `You reconcile credit-card transactions against a card's statement-credit benefits.\n` +
    `Card: ${cardName}\n\n` +
    `Benefits (index: description):\n${benefitList}\n\n` +
    `Transactions to classify:\n${txnList}\n\n` +
    `For each transaction, decide which ONE benefit it plausibly used (drew down), or none.\n` +
    `Rules:\n` +
    `- Match by merchant/category fit to the benefit's purpose.\n` +
    `- Do NOT map a transaction to a benefit that has $0 remaining this period.\n` +
    `- A "(credit/refund)" line labeled as a credit is the issuer reimbursing a benefit — map it.\n` +
    `- Issuers sometimes post reimbursements under the plain merchant name (e.g. Amex's Walmart+ ` +
    `rebate posts as "Walmart"). A refund whose amount ≈ the benefit's periodic amount, close in ` +
    `time to a matching purchase, is likely such a reimbursement — map it. An arbitrary-amount ` +
    `one-off refund is likely a merchant return — use -1.\n` +
    `- Airline/incidental fee credits cover incidentals (bags, seats, change fees), NOT airfare — ` +
    `do not map ticket purchases (typically large amounts) to them.\n` +
    `- If unsure, use -1 (no match).\n` +
    `Reply with ONLY JSON, no prose: ` +
    `{"maps":[{"txn":"<transactionId>","benefit":<index or -1>,"confidence":<0-1>}]}`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`openrouter HTTP ${res.status}`);
    const data: any = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const json = text.match(/\{[\s\S]*\}/);
    if (!json) return [];
    const parsed = JSON.parse(json[0]);
    const maps = Array.isArray(parsed?.maps) ? parsed.maps : [];
    const byTxn = new Map<string, { benefit: number; confidence: number }>();
    for (const m of maps)
      if (m && typeof m.txn === "string")
        byTxn.set(m.txn, {
          benefit: Number(m.benefit),
          confidence: Number(m.confidence),
        });

    return candidates.map((c) => {
      const m = byTxn.get(c.transactionId);
      const ok =
        m &&
        Number.isInteger(m.benefit) &&
        m.benefit >= 0 &&
        m.benefit < benefits.length &&
        m.confidence >= CONFIDENCE_THRESHOLD;
      return {
        transactionId: c.transactionId,
        benefitId: ok ? benefits[m!.benefit].id : null,
      };
    });
  } catch (e) {
    console.error("Plaid LLM classify failed", e);
    return null;
  }
}
