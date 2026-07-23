import { describe, expect, it } from "vitest";
import { invertAuditDelta } from "./auditRevert";

// Reverting an audit row = applying its inverse. Scalars restore `before`;
// array items invert the delta.

const ARRAY_FIELDS = new Set(["spendBonusCategory", "benefit"]);

describe("invertAuditDelta", () => {
  it("scalar patch reverts to before", () => {
    expect(
      invertAuditDelta(
        { field: "annualFee", changeType: "patch", before: 95, after: 195 },
        ARRAY_FIELDS,
      ),
    ).toEqual({ kind: "scalar", field: "annualFee", value: 95 });
  });

  it("scalar revert may restore an unset field", () => {
    expect(
      invertAuditDelta(
        { field: "fxFee", changeType: "patch", before: undefined, after: 3 },
        ARRAY_FIELDS,
      ),
    ).toEqual({ kind: "scalar", field: "fxFee", value: undefined });
  });

  it("item add inverts to a remove by name", () => {
    expect(
      invertAuditDelta(
        {
          field: "benefit",
          changeType: "add",
          before: undefined,
          after: { name: "Lounge Access", desc: "PP" },
        },
        ARRAY_FIELDS,
      ),
    ).toEqual({
      kind: "item",
      field: "benefit",
      changeType: "remove",
      itemName: "Lounge Access",
    });
  });

  it("item remove inverts to adding the before item back", () => {
    expect(
      invertAuditDelta(
        {
          field: "spendBonusCategory",
          changeType: "remove",
          before: { name: "Gas", multiplier: 4 },
          after: undefined,
        },
        ARRAY_FIELDS,
      ),
    ).toEqual({
      kind: "item",
      field: "spendBonusCategory",
      changeType: "add",
      itemName: "Gas",
      item: { name: "Gas", multiplier: 4 },
    });
  });

  it("item patch inverts to patching the before content back", () => {
    expect(
      invertAuditDelta(
        {
          field: "spendBonusCategory",
          changeType: "patch",
          before: { name: "Gas", multiplier: 4 },
          after: { name: "Gas", multiplier: 5 },
        },
        ARRAY_FIELDS,
      ),
    ).toEqual({
      kind: "item",
      field: "spendBonusCategory",
      changeType: "patch",
      itemName: "Gas",
      item: { name: "Gas", multiplier: 4 },
    });
  });

  it("returns null when the row lacks what the inverse needs", () => {
    expect(
      invertAuditDelta(
        { field: "benefit", changeType: "add", before: undefined, after: undefined },
        ARRAY_FIELDS,
      ),
    ).toBeNull();
    expect(
      invertAuditDelta(
        {
          field: "benefit",
          changeType: "patch",
          before: undefined,
          after: { name: "x" },
        },
        ARRAY_FIELDS,
      ),
    ).toBeNull();
  });
});
