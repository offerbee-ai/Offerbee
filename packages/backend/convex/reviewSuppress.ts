// Review-loop integrity primitives for the freshness pipeline. Three concerns:
//
//  1. Manual pins: a field whose provenance says source:"manual" was set by a
//     human (confirm/reject) — the pipeline must never auto-apply over it.
//  2. Rejected-proposal suppression: a proposal a reviewer already rejected must
//     not be re-enqueued every TTL cycle. Suppression is value-level — the same
//     (field, item, changeType, value) is suppressed; a genuinely new value
//     re-proposes normally.
//  3. Stale confirms: a queued proposal describes a diff against the data as it
//     was when enqueued; if the live data has since changed, confirming it
//     verbatim would clobber the newer value — such rows are marked stale.
//
// Pure module — unit-testable. No Convex imports.

import { norm, META_KEYS } from "./cardDataDiff";
import { toNum } from "./cardExtractionParse";

// Stable stringify for comparing field values across runs: object keys sorted,
// extraction metadata (confidence/sourceUrl/group) dropped, and every string
// whitespace/case-normalized so formatting drift alone never breaks a match.
export function canonicalValue(value: unknown): string {
  if (typeof value === "string") {
    // signupBonusAmount is number|string in the schema, and sources flip
    // between "60000" and 60000 for the same value — canonicalize pure numeric
    // strings as numbers so a type flip alone never reads as a data change.
    const t = value.trim();
    if (t !== "" && /^-?\d+(\.\d+)?$/.test(t)) return JSON.stringify(Number(t));
    return JSON.stringify(norm(value));
  }
  if (Array.isArray(value))
    return `[${value.map((v) => canonicalValue(v)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .filter((k) => !META_KEYS.has(k))
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonicalValue((value as Record<string, unknown>)[k])}`,
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export type ProvenanceEntry = {
  field: string;
  source: string;
  value?: unknown;
};

// Whether a human has pinned this field (confirmed or rejected a review for it).
export function hasManualPin(
  provenance: ProvenanceEntry[] | undefined,
  field: string,
): boolean {
  return (provenance ?? []).some(
    (p) => p.field === field && p.source === "manual",
  );
}

export type RejectedRow = {
  field: string;
  itemName?: string;
  changeType?: string;
  proposedValue?: unknown;
  status: string;
};

export type ProposedChange = {
  field: string;
  name?: string;
  changeType: string;
  // Stored-shape proposed value (what a review row would carry) — scalar for
  // scalar fields, the stored item for array deltas, undefined for removals.
  proposed?: unknown;
};

const normName = (s: string | undefined) => norm(s ?? "");

// Whether this change matches a previously rejected proposal: same field, same
// item (both scalar, or same normalized name), same kind of change, and the
// same canonical value. Scalars carry no changeType on legacy rows — treat an
// absent changeType as "patch".
export function matchesRejected(
  rejected: RejectedRow[],
  change: ProposedChange,
): boolean {
  const key = canonicalValue(change.proposed);
  return rejected.some(
    (r) =>
      r.status === "rejected" &&
      r.field === change.field &&
      normName(r.itemName) === normName(change.name) &&
      (r.changeType ?? "patch") === change.changeType &&
      canonicalValue(r.proposedValue) === key,
  );
}

export type ReviewLike = {
  field: string;
  changeType?: string;
  itemName?: string;
  currentValue?: unknown;
  proposedValue?: unknown;
};

// Whether a pending review row no longer describes the live data (confirming it
// would write over a value that changed after the proposal was enqueued).
//
//  - scalar:      stale iff the live value differs from the row's currentValue
//  - item patch:  stale iff the named live item is gone or differs from it
//  - item add:    stale iff an item of that name now exists with DIFFERENT
//                 content (identical content → confirm is an idempotent no-op)
//  - item remove: never stale — the item being gone already is the desired end
//                 state, and applyItemDelta's remove is name-keyed regardless
export function reviewIsStale(
  liveValue: unknown,
  review: ReviewLike,
  nameKeys?: string[],
): boolean {
  const isItemDelta =
    !!nameKeys && !!review.changeType && review.itemName !== undefined;

  if (!isItemDelta) {
    if (canonicalValue(liveValue) === canonicalValue(review.currentValue))
      return false;
    // Type-flip tolerance: signupBonusAmount is number|string in the catalog,
    // so a RapidAPI refresh can return the SAME amount as the other JS type
    // ("60000" vs 60000). A cross-type numeric match is not staleness — same
    // coercion the pipeline's diff uses (toNum).
    const typeFlip =
      (typeof liveValue === "string" &&
        typeof review.currentValue === "number") ||
      (typeof liveValue === "number" &&
        typeof review.currentValue === "string");
    if (typeFlip) {
      const live = toNum(liveValue);
      if (live !== undefined && live === toNum(review.currentValue))
        return false;
    }
    return true;
  }

  const arr = Array.isArray(liveValue) ? liveValue : [];
  const key = normName(review.itemName);
  const nameOf = (item: Record<string, unknown>) =>
    normName(
      String(nameKeys!.map((k) => item?.[k]).find((x) => x != null) ?? ""),
    );
  const live = arr.find((i) => nameOf(i) === key);

  switch (review.changeType) {
    case "patch":
      return (
        live === undefined ||
        canonicalValue(live) !== canonicalValue(review.currentValue)
      );
    case "add":
      return (
        live !== undefined &&
        canonicalValue(live) !== canonicalValue(review.proposedValue)
      );
    default: // remove
      return false;
  }
}
