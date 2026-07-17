// Map a raw Plaid transaction to our normalized shape. Pure (no Convex
// imports) — unit-testable, same pattern as plaidMatch.ts.

// Plaid's `date` is the POSTING date for posted transactions — it can lag the
// real transaction date by days and cross a benefit-period boundary (a June 29
// "DINING CREDIT $300/YEAR" posts July 1 and would land in the wrong half).
// `authorized_date` is the date the transaction actually occurred — it matches
// the user's statement, and Plaid recommends preferring it. So `date` here is
// the effective/statement date; the raw posting date is kept as `postedDate`
// for observability.
const parseDay = (s: unknown): number | null =>
  typeof s === "string" ? Date.parse(`${s}T00:00:00Z`) || null : null;

export function normalizeTxn(t: any) {
  const posted = parseDay(t.date);
  const authorized = parseDay(t.authorized_date);
  return {
    transactionId: String(t.transaction_id),
    accountId: String(t.account_id),
    merchantName: t.merchant_name ?? undefined,
    name: t.name ?? undefined,
    originalDescription: t.original_description ?? undefined,
    amount: typeof t.amount === "number" ? t.amount : Number(t.amount) || 0,
    date: authorized ?? posted ?? Date.now(),
    postedDate: posted ?? undefined,
    pfcPrimary: t.personal_finance_category?.primary ?? undefined,
    pfcDetailed: t.personal_finance_category?.detailed ?? undefined,
    pending: Boolean(t.pending),
  };
}
