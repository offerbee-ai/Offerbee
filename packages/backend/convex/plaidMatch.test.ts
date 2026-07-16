import { describe, expect, it } from "vitest";
import {
  cappedUsageAmount,
  isRecurringReimbursement,
  matchBenefitToTransaction,
  resolveSuggestion,
} from "./plaidMatch";

const walmart = {
  title: "$155 Walmart+ Credit",
  benefitTitle: "$155 Walmart+ Credit",
};

const d = (y: number, m: number, day: number) => Date.UTC(y, m, day);

describe("matchBenefitToTransaction — statement credits", () => {
  it("matches an issuer-labeled statement credit (high)", () => {
    const r = matchBenefitToTransaction(walmart, {
      name: "Platinum Walmart+ Credit",
      amount: -12.95,
    });
    expect(r).toEqual({
      confidence: "high",
      reason: "statement credit posting",
    });
  });

  it("uses originalDescription when Plaid's cleaned name is bare", () => {
    // Plaid cleans the posting to "Walmart"; the raw statement line still
    // carries the credit wording.
    const r = matchBenefitToTransaction(walmart, {
      name: "Walmart",
      originalDescription: "WALMART+ MONTHLY MEMBERSHIP CREDIT 028009666546",
      amount: -14.08,
    });
    expect(r).toEqual({
      confidence: "high",
      reason: "statement credit posting",
    });
  });
});

describe("matchBenefitToTransaction — unlabeled refunds", () => {
  it("flags an unlabeled refund at a benefit merchant as medium (LLM decides)", () => {
    // The real-world Walmart+ case: reimbursement arrives named just "Walmart".
    const r = matchBenefitToTransaction(walmart, {
      name: "Walmart",
      amount: -14.08,
      pfcPrimary: "GENERAL_MERCHANDISE",
    });
    expect(r?.confidence).toBe("medium");
    expect(r?.reason).toMatch(/refund/i);
  });

  it("ignores refunds at unrelated merchants", () => {
    const r = matchBenefitToTransaction(walmart, {
      name: "AUTOPAY PAYMENT - THANK YOU",
      amount: -103.46,
    });
    expect(r).toBeNull();
  });

  it("never uses Plaid categories for refunds", () => {
    // A restaurant refund is not evidence a dining credit was applied, even
    // though the category matches the benefit's curated category rule.
    const r = matchBenefitToTransaction(
      { title: "$300 Dining Credit" },
      { name: "Chipotle", amount: -20, pfcPrimary: "FOOD_AND_DRINK" },
    );
    expect(r).toBeNull();
  });
});

describe("isRecurringReimbursement", () => {
  const benefit = { ...walmart, amount: 12.95 };
  const txn = { text: "Walmart", amount: -14.08, date: d(2026, 6, 7) };
  const prior = (m: number, over: Partial<typeof txn> = {}) => ({
    text: "Walmart",
    amount: -14.08,
    date: d(2026, m, 7),
    ...over,
  });

  it("detects a monthly reimbursement with two prior-month pairs", () => {
    expect(isRecurringReimbursement(benefit, txn, [prior(4), prior(5)])).toBe(
      true,
    );
  });

  it("needs at least two prior distinct months", () => {
    expect(isRecurringReimbursement(benefit, txn, [prior(5)])).toBe(false);
  });

  it("counts same-month priors only once", () => {
    expect(
      isRecurringReimbursement(benefit, txn, [
        prior(5),
        prior(5, { date: d(2026, 5, 20) }),
      ]),
    ).toBe(false);
  });

  it("rejects amounts outside the benefit's periodic amount tolerance", () => {
    const big = { ...txn, amount: -45 };
    expect(
      isRecurringReimbursement(benefit, big, [
        prior(4, { amount: -45 }),
        prior(5, { amount: -45 }),
      ]),
    ).toBe(false);
  });

  it("rejects priors at unrelated merchants", () => {
    expect(
      isRecurringReimbursement(benefit, txn, [
        prior(4, { text: "Wayfair" }),
        prior(5, { text: "Wayfair" }),
      ]),
    ).toBe(false);
  });

  it("rejects purchases", () => {
    expect(
      isRecurringReimbursement(
        benefit,
        { ...txn, amount: 14.08 },
        [prior(4), prior(5)],
      ),
    ).toBe(false);
  });
});

describe("resolveSuggestion", () => {
  const now = Date.UTC(2026, 6, 16); // Jul 16 2026
  const monthly25 = { amount: 25, cycle: "monthly" as const };
  const annual200 = { amount: 200, cycle: "annual" as const };

  it("covered: issuer captured ≥80% of the period (YouTube $22.99 vs $25)", () => {
    expect(
      resolveSuggestion(monthly25, Date.UTC(2026, 6, 8), 22.99, now),
    ).toBe("covered");
  });

  it("open: current period with real allowance left", () => {
    expect(resolveSuggestion(monthly25, Date.UTC(2026, 6, 8), 10, now)).toBe(
      "open",
    );
  });

  it("expired: the suggestion's period already ended", () => {
    expect(resolveSuggestion(monthly25, Date.UTC(2026, 5, 19), 0, now)).toBe(
      "expired",
    );
  });

  it("annual credits stay open across months", () => {
    expect(resolveSuggestion(annual200, Date.UTC(2026, 2, 26), 26.8, now)).toBe(
      "open",
    );
  });

  it("covered wins over expired for past periods the issuer reimbursed", () => {
    expect(
      resolveSuggestion(monthly25, Date.UTC(2026, 3, 8), 22.99, now),
    ).toBe("covered");
  });

  it("treats exactly 80% as covered", () => {
    expect(resolveSuggestion(monthly25, Date.UTC(2026, 6, 8), 20, now)).toBe(
      "covered",
    );
  });
});

describe("cappedUsageAmount", () => {
  it("clamps a confirm to the benefit's remaining allowance", () => {
    expect(cappedUsageAmount(600, 0, 738)).toBe(600);
  });

  it("subtracts existing period usage", () => {
    expect(cappedUsageAmount(600, 500, 738)).toBe(100);
  });

  it("returns 0 when the period is already covered", () => {
    expect(cappedUsageAmount(12.95, 12.95, 14.08)).toBe(0);
  });

  it("logs the transaction amount when under the cap", () => {
    expect(cappedUsageAmount(12.95, 0, 5)).toBe(5);
  });

  it("rounds to cents", () => {
    expect(cappedUsageAmount(10, 3.333, 20)).toBe(6.67);
  });
});
