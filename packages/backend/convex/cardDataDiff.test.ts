import { describe, expect, it } from "vitest";
import { diffScalar, diffNamedArray } from "./cardDataDiff";

// Pure diff primitives for the freshness pipeline: compare a stored value to
// the LLM-extracted value and emit typed change ops. Array items are matched by
// normalized name so a renamed/added/removed earn category or benefit is
// detected. Orchestration (which extracted field maps to which stored field)
// lives in the pipeline action; these primitives stay generic.

describe("diffScalar", () => {
  it("returns null when values are equal", () => {
    expect(diffScalar("annualFee", 695, 695, 0.9)).toBeNull();
  });

  it("emits a patch when the proposed value differs", () => {
    expect(diffScalar("annualFee", 550, 695, 0.9, "https://amex.com")).toEqual({
      field: "annualFee",
      changeType: "patch",
      current: 550,
      proposed: 695,
      confidence: 0.9,
      sourceUrl: "https://amex.com",
    });
  });

  it("emits a patch when there is no current value", () => {
    const c = diffScalar("annualFee", undefined, 0, 0.8);
    expect(c).toMatchObject({ changeType: "patch", current: undefined, proposed: 0 });
  });
});

describe("diffNamedArray", () => {
  it("emits add for a proposed item absent from current", () => {
    const changes = diffNamedArray(
      "spendBonusCategory",
      [],
      [{ name: "Costco Gas", multiplier: 5 }],
    );
    expect(changes).toEqual([
      {
        field: "spendBonusCategory",
        changeType: "add",
        name: "Costco Gas",
        proposed: { name: "Costco Gas", multiplier: 5 },
      },
    ]);
  });

  it("emits remove for a current item absent from proposed", () => {
    const changes = diffNamedArray(
      "spendBonusCategory",
      [{ name: "Old Category", multiplier: 2 }],
      [],
    );
    expect(changes).toEqual([
      {
        field: "spendBonusCategory",
        changeType: "remove",
        name: "Old Category",
        current: { name: "Old Category", multiplier: 2 },
      },
    ]);
  });

  it("emits patch when a name-matched item changed", () => {
    const changes = diffNamedArray(
      "spendBonusCategory",
      [{ name: "Gas", multiplier: 4 }],
      [{ name: "Gas", multiplier: 5 }],
    );
    expect(changes).toEqual([
      {
        field: "spendBonusCategory",
        changeType: "patch",
        name: "Gas",
        current: { name: "Gas", multiplier: 4 },
        proposed: { name: "Gas", multiplier: 5 },
      },
    ]);
  });

  it("emits nothing when arrays match", () => {
    const changes = diffNamedArray(
      "benefit",
      [{ name: "Lounge Access", desc: "x" }],
      [{ name: "Lounge Access", desc: "x" }],
    );
    expect(changes).toEqual([]);
  });

  it("matches names case-insensitively and trimmed", () => {
    const changes = diffNamedArray(
      "spendBonusCategory",
      [{ name: "Gas Stations", multiplier: 4 }],
      [{ name: "  gas stations ", multiplier: 4 }],
    );
    // Same category, same multiplier → no add/remove, no meaningful change.
    expect(changes.filter((c) => c.changeType !== "patch")).toEqual([]);
  });
});
