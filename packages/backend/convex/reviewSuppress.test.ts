import { describe, expect, it } from "vitest";
import {
  canonicalValue,
  hasManualPin,
  matchesRejected,
  reviewIsStale,
} from "./reviewSuppress";

// Review-loop integrity: canonical value comparison, manual-pin detection,
// rejected-proposal suppression, and stale-confirm detection.

describe("canonicalValue", () => {
  it("treats key order as irrelevant", () => {
    expect(canonicalValue({ a: 1, b: 2 })).toBe(canonicalValue({ b: 2, a: 1 }));
  });

  it("normalizes string case and whitespace drift", () => {
    expect(canonicalValue({ benefitTitle: "Lounge  Access" })).toBe(
      canonicalValue({ benefitTitle: "lounge access" }),
    );
  });

  it("ignores extraction metadata keys (confidence/sourceUrl/group)", () => {
    expect(
      canonicalValue({ name: "gas", multiplier: 5, confidence: 0.9, sourceUrl: "https://x.com" }),
    ).toBe(canonicalValue({ name: "gas", multiplier: 5, group: "Auto" }));
  });

  it("distinguishes genuinely different values", () => {
    expect(canonicalValue({ earnMultiplier: 4 })).not.toBe(
      canonicalValue({ earnMultiplier: 5 }),
    );
    expect(canonicalValue(95)).not.toBe(canonicalValue(0));
    expect(canonicalValue(undefined)).not.toBe(canonicalValue(0));
  });

  it("compares arrays element-wise", () => {
    expect(canonicalValue([{ a: 1 }, { b: 2 }])).toBe(
      canonicalValue([{ a: 1 }, { b: 2 }]),
    );
    expect(canonicalValue([{ a: 1 }])).not.toBe(canonicalValue([{ a: 2 }]));
  });
});

describe("hasManualPin", () => {
  const prov = [
    { field: "annualFee", source: "manual", value: 95 },
    { field: "fxFee", source: "web", value: 0 },
  ];

  it("detects a manual pin on the field", () => {
    expect(hasManualPin(prov, "annualFee")).toBe(true);
  });

  it("web provenance is not a pin", () => {
    expect(hasManualPin(prov, "fxFee")).toBe(false);
  });

  it("handles absent provenance", () => {
    expect(hasManualPin(undefined, "annualFee")).toBe(false);
  });
});

describe("matchesRejected", () => {
  const rejectedScalar = {
    field: "annualFee",
    proposedValue: 95,
    status: "rejected",
  };
  const rejectedItem = {
    field: "benefit",
    itemName: "Lounge Access",
    changeType: "add",
    proposedValue: { benefitTitle: "Lounge Access", benefitDesc: "Priority Pass" },
    status: "rejected",
  };

  it("suppresses a re-proposed rejected scalar (legacy rows have no changeType)", () => {
    expect(
      matchesRejected([rejectedScalar], {
        field: "annualFee",
        changeType: "patch",
        proposed: 95,
      }),
    ).toBe(true);
  });

  it("lets a different scalar value through", () => {
    expect(
      matchesRejected([rejectedScalar], {
        field: "annualFee",
        changeType: "patch",
        proposed: 195,
      }),
    ).toBe(false);
  });

  it("suppresses a re-proposed rejected item add, tolerating name-case drift", () => {
    expect(
      matchesRejected([rejectedItem], {
        field: "benefit",
        name: "lounge access",
        changeType: "add",
        proposed: { benefitTitle: "lounge  access", benefitDesc: "priority pass" },
      }),
    ).toBe(true);
  });

  it("lets the same item through when its content changed", () => {
    expect(
      matchesRejected([rejectedItem], {
        field: "benefit",
        name: "Lounge Access",
        changeType: "add",
        proposed: { benefitTitle: "Lounge Access", benefitDesc: "Centurion only" },
      }),
    ).toBe(false);
  });

  it("distinguishes changeType (a rejected add does not suppress a remove)", () => {
    expect(
      matchesRejected([rejectedItem], {
        field: "benefit",
        name: "Lounge Access",
        changeType: "remove",
        proposed: undefined,
      }),
    ).toBe(false);
  });

  it("suppresses a re-proposed rejected removal (both proposals undefined)", () => {
    const rejectedRemove = {
      field: "benefit",
      itemName: "Lounge Access",
      changeType: "remove",
      proposedValue: undefined,
      status: "rejected",
    };
    expect(
      matchesRejected([rejectedRemove], {
        field: "benefit",
        name: "Lounge Access",
        changeType: "remove",
        proposed: undefined,
      }),
    ).toBe(true);
  });

  it("ignores non-rejected rows", () => {
    expect(
      matchesRejected([{ ...rejectedScalar, status: "pending" }], {
        field: "annualFee",
        changeType: "patch",
        proposed: 95,
      }),
    ).toBe(false);
  });
});

describe("reviewIsStale", () => {
  const nameKeys = ["benefitTitle"];

  it("scalar: not stale while the live value still matches", () => {
    expect(
      reviewIsStale(95, { field: "annualFee", currentValue: 95, proposedValue: 195 }),
    ).toBe(false);
  });

  it("scalar: stale once the live value moved", () => {
    expect(
      reviewIsStale(150, { field: "annualFee", currentValue: 95, proposedValue: 195 }),
    ).toBe(true);
  });

  it("scalar: stale when the field was set after an undefined snapshot", () => {
    expect(
      reviewIsStale(95, { field: "annualFee", currentValue: undefined, proposedValue: 195 }),
    ).toBe(true);
  });

  it("scalar: a number|string type flip of the same amount is not stale", () => {
    expect(
      reviewIsStale("60000", {
        field: "signupBonusAmount",
        currentValue: 60000,
        proposedValue: 75000,
      }),
    ).toBe(false);
    expect(
      reviewIsStale(60000, {
        field: "signupBonusAmount",
        currentValue: "60,000",
        proposedValue: 75000,
      }),
    ).toBe(false);
  });

  it("scalar: a cross-type DIFFERENT amount is still stale", () => {
    expect(
      reviewIsStale("80000", {
        field: "signupBonusAmount",
        currentValue: 60000,
        proposedValue: 75000,
      }),
    ).toBe(true);
  });

  it("scalar: a non-numeric string never matches a number", () => {
    expect(
      reviewIsStale("two free nights", {
        field: "signupBonusAmount",
        currentValue: 60000,
        proposedValue: 75000,
      }),
    ).toBe(true);
  });

  const live = [
    { benefitTitle: "Lounge Access", benefitDesc: "Priority Pass" },
    { benefitTitle: "Free Night", benefitDesc: "Annual certificate" },
  ];

  it("item patch: not stale while the live item matches the snapshot", () => {
    expect(
      reviewIsStale(
        live,
        {
          field: "benefit",
          changeType: "patch",
          itemName: "Lounge Access",
          currentValue: { benefitTitle: "Lounge Access", benefitDesc: "Priority Pass" },
          proposedValue: { benefitTitle: "Lounge Access", benefitDesc: "PP Select" },
        },
        nameKeys,
      ),
    ).toBe(false);
  });

  it("item patch: stale when the live item has since changed", () => {
    expect(
      reviewIsStale(
        live,
        {
          field: "benefit",
          changeType: "patch",
          itemName: "Lounge Access",
          currentValue: { benefitTitle: "Lounge Access", benefitDesc: "Old desc" },
          proposedValue: { benefitTitle: "Lounge Access", benefitDesc: "PP Select" },
        },
        nameKeys,
      ),
    ).toBe(true);
  });

  it("item patch: stale when the live item was removed", () => {
    expect(
      reviewIsStale(
        live,
        {
          field: "benefit",
          changeType: "patch",
          itemName: "Cell Phone Protection",
          currentValue: { benefitTitle: "Cell Phone Protection" },
          proposedValue: { benefitTitle: "Cell Phone Protection", benefitDesc: "x" },
        },
        nameKeys,
      ),
    ).toBe(true);
  });

  it("item add: not stale when the item is still absent", () => {
    expect(
      reviewIsStale(
        live,
        {
          field: "benefit",
          changeType: "add",
          itemName: "Cell Phone Protection",
          proposedValue: { benefitTitle: "Cell Phone Protection" },
        },
        nameKeys,
      ),
    ).toBe(false);
  });

  it("item add: not stale when an identical item already exists (idempotent no-op)", () => {
    expect(
      reviewIsStale(
        live,
        {
          field: "benefit",
          changeType: "add",
          itemName: "Lounge Access",
          proposedValue: { benefitTitle: "Lounge Access", benefitDesc: "Priority Pass" },
        },
        nameKeys,
      ),
    ).toBe(false);
  });

  it("item add: stale when a same-name item exists with different content", () => {
    expect(
      reviewIsStale(
        live,
        {
          field: "benefit",
          changeType: "add",
          itemName: "Lounge Access",
          proposedValue: { benefitTitle: "Lounge Access", benefitDesc: "Centurion" },
        },
        nameKeys,
      ),
    ).toBe(true);
  });

  it("item remove: never stale (absent item is the desired end state)", () => {
    expect(
      reviewIsStale(
        live,
        {
          field: "benefit",
          changeType: "remove",
          itemName: "Gone Already",
          currentValue: { benefitTitle: "Gone Already" },
        },
        nameKeys,
      ),
    ).toBe(false);
  });

  it("treats a missing live array as empty", () => {
    expect(
      reviewIsStale(
        undefined,
        {
          field: "benefit",
          changeType: "add",
          itemName: "Lounge Access",
          proposedValue: { benefitTitle: "Lounge Access" },
        },
        nameKeys,
      ),
    ).toBe(false);
  });
});
