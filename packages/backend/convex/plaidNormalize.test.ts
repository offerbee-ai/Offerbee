import { describe, expect, it } from "vitest";
import { normalizeTxn } from "./plaidNormalize";

const d = (y: number, m: number, day: number) => Date.UTC(y, m, day);

const base = {
  transaction_id: "txn1",
  account_id: "acct1",
  name: "DINING CREDIT $300/YEAR",
  amount: -150,
  pending: false,
};

describe("normalizeTxn — date fields", () => {
  it("prefers authorized_date (statement date) over the posting date", () => {
    // The prod bug: dined June 29, Chase posted the credit July 1 — the usage
    // belongs to H1, matching what the user's statement shows.
    const t = normalizeTxn({
      ...base,
      date: "2026-07-01",
      authorized_date: "2026-06-29",
    });
    expect(t.date).toBe(d(2026, 5, 29));
    expect(t.postedDate).toBe(d(2026, 6, 1));
  });

  it("falls back to the posting date when authorized_date is null/absent", () => {
    expect(normalizeTxn({ ...base, date: "2026-07-01" }).date).toBe(
      d(2026, 6, 1),
    );
    expect(
      normalizeTxn({ ...base, date: "2026-07-01", authorized_date: null })
        .date,
    ).toBe(d(2026, 6, 1));
  });

  it("always carries the raw posting date as postedDate", () => {
    const t = normalizeTxn({ ...base, date: "2026-07-01" });
    expect(t.postedDate).toBe(d(2026, 6, 1));
  });

  it("ignores malformed authorized_date", () => {
    const t = normalizeTxn({
      ...base,
      date: "2026-07-01",
      authorized_date: "not-a-date",
    });
    expect(t.date).toBe(d(2026, 6, 1));
  });
});

describe("normalizeTxn — passthrough fields", () => {
  it("maps ids, amount, category, and pending", () => {
    const t = normalizeTxn({
      ...base,
      date: "2026-07-01",
      merchant_name: "Chase",
      original_description: "DINING CREDIT $300/YEAR",
      personal_finance_category: {
        primary: "TRANSFER_IN",
        detailed: "TRANSFER_IN_OTHER_TRANSFER_IN",
      },
    });
    expect(t.transactionId).toBe("txn1");
    expect(t.accountId).toBe("acct1");
    expect(t.amount).toBe(-150);
    expect(t.merchantName).toBe("Chase");
    expect(t.pfcPrimary).toBe("TRANSFER_IN");
    expect(t.pfcDetailed).toBe("TRANSFER_IN_OTHER_TRANSFER_IN");
    expect(t.pending).toBe(false);
  });
});
