// Inverts a cardDataAudit row into the write that undoes it. Scalar changes
// revert to `before`; array-item changes invert the delta (add→remove,
// remove→add-back, patch→patch-back). Items in audit rows are in the diff's
// NAMED shape ({ name, ... }) — the caller converts back to the stored shape
// (cardFieldMap) before writing. Pure module — unit-testable.

export type AuditLike = {
  field: string;
  changeType: "patch" | "add" | "remove";
  before?: unknown;
  after?: unknown;
};

export type RevertPlan =
  | { kind: "scalar"; field: string; value: unknown }
  | {
      kind: "item";
      field: string;
      changeType: "add" | "patch" | "remove";
      itemName: string;
      // Named-shape item to write back (absent when the inverse is a remove).
      item?: Record<string, unknown>;
    }
  | null;

const nameOf = (v: unknown): string | null => {
  const n =
    v && typeof v === "object" ? (v as Record<string, unknown>).name : null;
  return typeof n === "string" && n.trim() !== "" ? n : null;
};

export function invertAuditDelta(
  audit: AuditLike,
  arrayFields: Set<string>,
): RevertPlan {
  if (!arrayFields.has(audit.field)) {
    // Scalar: put the previous value back (may legitimately be undefined —
    // reverting a change that set a previously unset field).
    return { kind: "scalar", field: audit.field, value: audit.before };
  }

  switch (audit.changeType) {
    case "add": {
      const name = nameOf(audit.after);
      if (!name) return null;
      return { kind: "item", field: audit.field, changeType: "remove", itemName: name };
    }
    case "remove": {
      const name = nameOf(audit.before);
      if (!name) return null;
      return {
        kind: "item",
        field: audit.field,
        changeType: "add",
        itemName: name,
        item: audit.before as Record<string, unknown>,
      };
    }
    default: {
      const name = nameOf(audit.before) ?? nameOf(audit.after);
      if (!name || audit.before === undefined) return null;
      return {
        kind: "item",
        field: audit.field,
        changeType: "patch",
        itemName: name,
        item: audit.before as Record<string, unknown>,
      };
    }
  }
}
