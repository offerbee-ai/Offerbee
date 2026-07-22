import { describe, expect, it } from "vitest";
import {
  categoryToNamed,
  namedToCategory,
  benefitToNamed,
  namedToBenefit,
} from "./cardFieldMap";

// The stored cardDetails shapes (spendBonusCategory / benefit) differ from the
// normalized { name, ... } items the diff works on. These mappers bridge both
// directions; the round-trip must preserve the meaningful fields.

describe("cardFieldMap", () => {
  it("normalizes a stored earn category to a named item", () => {
    const named = categoryToNamed({
      spendBonusCategoryName: "Gas Stations",
      spendBonusCategoryGroup: "Auto",
      earnMultiplier: 4,
      spendLimit: 7000,
      spendBonusDesc: "4% on gas",
    });
    expect(named).toEqual({
      name: "Gas Stations",
      multiplier: 4,
      group: "Auto",
      spendLimit: 7000,
      desc: "4% on gas",
    });
  });

  it("falls back to spendBonusCategoryType when name is absent", () => {
    const named = categoryToNamed({ spendBonusCategoryType: "Single - Dining", earnMultiplier: 3 });
    expect(named.name).toBe("Single - Dining");
  });

  it("maps a named item back to the stored category shape and flags isSpendLimit", () => {
    const stored = namedToCategory({ name: "Costco Gas", multiplier: 5, spendLimit: 7000, desc: "5%" });
    expect(stored).toMatchObject({
      spendBonusCategoryName: "Costco Gas",
      earnMultiplier: 5,
      spendLimit: 7000,
      isSpendLimit: true,
      spendBonusDesc: "5%",
    });
  });

  it("does not flag isSpendLimit when there is no limit", () => {
    const stored = namedToCategory({ name: "Dining", multiplier: 3 });
    expect(stored.isSpendLimit).toBeUndefined();
    expect(stored.spendLimit).toBeUndefined();
  });

  it("round-trips a benefit through named form", () => {
    const stored = { benefitTitle: "Lounge Access", benefitDesc: "Centurion lounges" };
    const back = namedToBenefit(benefitToNamed(stored));
    expect(back).toEqual(stored);
  });
});
