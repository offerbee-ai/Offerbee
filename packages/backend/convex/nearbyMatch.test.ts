import { describe, expect, it } from "vitest";
import { validateBenefitMerchants } from "./benefitMerchants";
import { planBrandQueries, type UsableBenefit } from "./nearbyMatch";
import shippedConfig from "./benefitMerchants.json";

function benefit(over: Partial<UsableBenefit> & { cardKey: string }): UsableBenefit {
  return {
    id: Math.random().toString(36).slice(2),
    benefitTitle: undefined,
    title: "Some Credit",
    cardName: "Test Card",
    remaining: 10,
    cycle: "monthly",
    resetAt: 0,
    ...over,
  };
}

describe("benefitMerchants config", () => {
  it("shipped benefitMerchants.json validates", () => {
    expect(() => validateBenefitMerchants(shippedConfig)).not.toThrow();
  });

  it("rejects a mapping missing brandKey/query", () => {
    expect(() =>
      validateBenefitMerchants({ "amex-gold": { X: { query: "X" } } }),
    ).toThrow(/brandKey/);
  });

  it("rejects an invalid kind", () => {
    expect(() =>
      validateBenefitMerchants({
        "amex-gold": { X: { brandKey: "x", query: "X", kind: "drive-thru" } },
      }),
    ).toThrow(/kind/);
  });
});

describe("planBrandQueries", () => {
  it("maps a store benefit to its brand query (title fallback)", () => {
    const plans = planBrandQueries([
      benefit({ cardKey: "amex-gold", title: "Dunkin' Credit", remaining: 7 }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ brandKey: "dunkin", query: "Dunkin'", value: 7 });
  });

  it("skips online/delivery benefits (no storefront)", () => {
    const plans = planBrandQueries([
      benefit({ cardKey: "amex-gold", title: "Dining Credit" }), // kind: online
      benefit({ cardKey: "amex-platinum", title: "Uber Cash" }), // kind: online
    ]);
    expect(plans).toHaveLength(0);
  });

  it("skips unmapped benefits and zero-remaining benefits", () => {
    const plans = planBrandQueries([
      benefit({ cardKey: "amex-gold", title: "Totally Unknown Credit" }),
      benefit({ cardKey: "amex-gold", title: "Dunkin' Credit", remaining: 0 }),
    ]);
    expect(plans).toHaveLength(0);
  });

  it("dedupes two benefits at the same brand and sums their value", () => {
    const plans = planBrandQueries([
      benefit({ cardKey: "amex-gold", title: "Dunkin' Credit", remaining: 7 }),
      benefit({ cardKey: "amex-gold", title: "Dunkin' Credit", remaining: 5 }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].brandKey).toBe("dunkin");
    expect(plans[0].value).toBe(12);
    expect(plans[0].benefits).toHaveLength(2);
  });

  it("ranks brands by summed unclaimed value, then applies the cap", () => {
    const plans = planBrandQueries(
      [
        benefit({ cardKey: "amex-gold", title: "Dunkin' Credit", remaining: 7 }),
        benefit({ cardKey: "amex-platinum", title: "Saks Credit", remaining: 50 }),
      ],
      1,
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].brandKey).toBe("saks"); // higher value wins the single slot
  });

  it("matches the mapping key case-insensitively", () => {
    const plans = planBrandQueries([
      benefit({ cardKey: "amex-gold", benefitTitle: "dunkin' CREDIT", title: "x" }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].brandKey).toBe("dunkin");
  });
});
