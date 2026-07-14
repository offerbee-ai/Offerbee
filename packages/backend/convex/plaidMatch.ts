// Pure transaction ↔ benefit matching (no Convex imports — unit-testable).
// Two signals:
//   1. STATEMENT CREDIT (negative amount, named after the credit, e.g. "Platinum
//      Resy Credit") — the issuer literally applied the credit. Authoritative →
//      HIGH-confidence auto-log. Works generically for any credit (no curated
//      rule needed) by matching the benefit's distinctive title words.
//   2. PURCHASE (positive amount) — curated merchant keyword (HIGH) or Plaid
//      category (MEDIUM → suggestion), with a heuristic merchant fallback.
// See plaid.ts for how the result drives auto-log vs suggestion.

export type MatchTxn = {
  merchantName?: string;
  name?: string;
  pfcPrimary?: string; // personal_finance_category.primary (e.g. FOOD_AND_DRINK)
  amount: number; // dollars; positive = purchase, negative = credit/refund
};

export type MatchBenefit = {
  title: string;
  benefitTitle?: string;
};

export type MatchResult = {
  confidence: "high" | "medium";
  reason: string;
};

type Rule = {
  test: RegExp; // matched against the benefit's title/benefitTitle
  merchants?: string[]; // lowercase substrings expected in the txn merchant/name
  categories?: string[]; // Plaid PFC primary values (uppercase)
};

// Curated rules — merchant-specific credits first (they produce HIGH-confidence
// auto-logs), then category credits (MEDIUM → suggestions). Extend over time;
// PFC primary values come from Plaid's personal_finance_category taxonomy.
const RULES: Rule[] = [
  { test: /lululemon/i, merchants: ["lululemon"] },
  { test: /uber\s*eats/i, merchants: ["uber eats", "ubereats"] },
  { test: /\buber\b|uber cash/i, merchants: ["uber"] },
  { test: /\blyft\b/i, merchants: ["lyft"] },
  { test: /saks/i, merchants: ["saks"] },
  { test: /dunkin/i, merchants: ["dunkin"] },
  { test: /equinox|soulcycle/i, merchants: ["equinox", "soulcycle"] },
  { test: /grubhub|seamless/i, merchants: ["grubhub", "seamless"] },
  { test: /instacart/i, merchants: ["instacart"] },
  { test: /walmart\+?/i, merchants: ["walmart"] },
  { test: /disney\+|hulu|espn\+/i, merchants: ["disney", "hulu", "espn"] },
  // Resy is merchant-specific — the credit only applies to Resy-booked dining,
  // so a "Resy" charge is a high-confidence auto-log, NOT a broad dining match.
  { test: /\bresy\b/i, merchants: ["resy"] },
  // Category credits (generic dining → suggestion)
  { test: /\bdining\b|restaurant/i, categories: ["FOOD_AND_DRINK"] },
  {
    test: /airline|air travel|incidental|flight|prepaid hotel|hotel|lodging|travel/i,
    categories: ["TRAVEL"],
  },
  { test: /rideshare|ride share|transit|transportation/i, categories: ["TRANSPORTATION"] },
  { test: /streaming|digital entertainment/i, categories: ["ENTERTAINMENT"] },
];

// Strip $ amounts + generic credit words to leave a benefit's distinctive words
// (e.g. "$400 Resy Credit" → ["resy"], "Digital Entertainment Credit" →
// ["digital","entertainment"]). Used for the heuristic merchant token and for
// statement-credit matching.
const GENERIC_WORDS =
  /\b(annual|monthly|quarterly|semiannual|semi-annual|statement|credit|credits|fee|fees|reimbursement|membership|plus|card|platinum|gold|green|up|to|each|per|the|and|of|a|an|in|on|your|for|rebate|cash|back|rewards|reward|offer)\b/gi;

function distinctiveTokens(title: string, benefitTitle?: string): string[] {
  const cleaned = `${title} ${benefitTitle ?? ""}`
    .replace(/\$\s?[\d,]+(\.\d+)?/g, " ")
    .replace(GENERIC_WORDS, " ")
    .replace(/[^a-zA-Z ]/g, " ")
    .toLowerCase();
  return Array.from(
    new Set(cleaned.split(/\s+/).filter((w) => w.length >= 4)),
  );
}

// True when a transaction is labeled by the issuer as a credit posting
// ("... Credit" / "... Reimbursement" / "Statement Credit") — i.e. a refund of a
// benefit, not an ordinary merchant refund.
export function isCreditLabeled(txnName: string): boolean {
  return /\b(credit|reimbursement|statement)\b/i.test(txnName);
}

// A negative transaction that the issuer labels as a credit ("... Credit" /
// "... Reimbursement") and whose name contains all of the benefit's distinctive
// words is that credit being applied — the strongest "used" signal.
export function isStatementCreditFor(
  benefit: MatchBenefit,
  txnName: string,
): boolean {
  if (!isCreditLabeled(txnName)) return false;
  const n = txnName.toLowerCase();
  const tokens = distinctiveTokens(benefit.title, benefit.benefitTitle);
  return tokens.length > 0 && tokens.every((t) => n.includes(t));
}

export function matchBenefitToTransaction(
  benefit: MatchBenefit,
  txn: MatchTxn,
): MatchResult | null {
  const txnMerchant = `${txn.merchantName ?? ""} ${txn.name ?? ""}`.toLowerCase();

  // Negative amount → the issuer applying a statement credit (authoritative), or
  // a plain merchant refund (ignored). Only the former is a "used" signal.
  if (txn.amount < 0) {
    return isStatementCreditFor(benefit, txnMerchant)
      ? { confidence: "high", reason: "statement credit posting" }
      : null;
  }
  if (!(txn.amount > 0)) return null;

  const hay = `${benefit.benefitTitle ?? ""} ${benefit.title}`;
  const pfc = (txn.pfcPrimary ?? "").toUpperCase();

  const rule = RULES.find((r) => r.test.test(hay));
  if (rule) {
    if (rule.merchants?.some((m) => txnMerchant.includes(m)))
      return { confidence: "high", reason: "curated merchant match" };
    if (rule.categories?.some((c) => pfc === c))
      return { confidence: "medium", reason: `category ${pfc}` };
    return null;
  }

  // No curated rule — try a heuristic merchant token from the benefit title.
  const [token] = distinctiveTokens(benefit.title);
  if (token && txnMerchant.includes(token))
    return { confidence: "medium", reason: `heuristic merchant '${token}'` };
  return null;
}
