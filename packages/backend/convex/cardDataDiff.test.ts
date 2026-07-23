import { describe, expect, it } from "vitest";
import { diffScalar, diffNamedArray, isMassRemoval, norm } from "./cardDataDiff";

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

  it("ignores confidence/sourceUrl metadata when detecting changes", () => {
    const changes = diffNamedArray(
      "spendBonusCategory",
      [{ name: "Gas", multiplier: 4 }],
      [{ name: "Gas", multiplier: 4, confidence: 0.9, sourceUrl: "https://citi.com" }],
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

describe("isMassRemoval", () => {
  const removes = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      field: "benefit",
      changeType: "remove" as const,
      name: `b${i}`,
      current: { name: `b${i}` },
    }));

  it("no removals / a single removal is never suspect", () => {
    expect(isMassRemoval(5, [])).toBe(false);
    expect(isMassRemoval(5, removes(1))).toBe(false);
    expect(isMassRemoval(1, removes(1))).toBe(false);
  });

  it("a strict majority of 2+ removals is suspect", () => {
    expect(isMassRemoval(3, removes(2))).toBe(true);
    expect(isMassRemoval(4, removes(3))).toBe(true);
    expect(isMassRemoval(2, removes(2))).toBe(true);
    expect(isMassRemoval(10, removes(10))).toBe(true);
  });

  it("half or less is not suspect", () => {
    expect(isMassRemoval(4, removes(2))).toBe(false);
    expect(isMassRemoval(10, removes(5))).toBe(false);
  });

  it("counts only removals, not adds/patches", () => {
    const mixed = [
      ...removes(1),
      { field: "benefit", changeType: "add" as const, name: "x", proposed: { name: "x" } },
      {
        field: "benefit",
        changeType: "patch" as const,
        name: "y",
        current: { name: "y" },
        proposed: { name: "y", desc: "z" },
      },
    ];
    expect(isMassRemoval(2, mixed)).toBe(false);
  });
});

// norm() strips a leading currency amount + trademark symbols so the same
// benefit matches across title conventions (kills re-title churn).
describe("norm canonicalization", () => {
  it("strips leading dollar amount", () => {
    expect(norm("$500 Southwest Airlines Credit")).toBe(norm("Southwest Airlines Credit"));
    expect(norm("$1,250 Baggage Credit")).toBe("baggage credit");
    expect(norm("up to $120 Lyft Credit")).toBe("lyft credit");
  });
  it("strips trademark symbols", () => {
    expect(norm("IHG One Rewards Platinum Elite Status®")).toBe(norm("IHG One Rewards Platinum Elite Status"));
  });
  it("requires a delimiter after the leading amount (no false merge)", () => {
    expect(norm("$500Credit")).toBe("$500credit"); // glued amount NOT stripped
    expect(norm("$500Credit")).not.toBe(norm("Credit"));
    expect(norm("$500 Credit")).toBe("credit"); // real delimiter still stripped
  });
  it("does not merge distinct benefits or strip mid-title amounts", () => {
    expect(norm("$300 Annual Travel Credit")).not.toBe(norm("$300 Annual Dining Credit"));
    expect(norm("Credit for up to $100")).toBe("credit for up to $100"); // amount not leading
  });
  it("re-titled benefit is a patch, not remove+add churn", () => {
    const current = [{ name: "$500 Southwest Airlines Credit", desc: "old" }];
    const proposed = [{ name: "Southwest Airlines Credit", desc: "old" }];
    const changes = diffNamedArray("benefit", current as any, proposed as any);
    expect(changes.filter((c) => c.changeType === "remove")).toHaveLength(0);
    expect(changes.filter((c) => c.changeType === "add")).toHaveLength(0);
  });
});
