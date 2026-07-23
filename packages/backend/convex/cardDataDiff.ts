// Pure diff primitives for the card-data freshness pipeline. Compare a stored
// value to the LLM-extracted value and emit typed change ops that the gate
// (auto-apply vs review) and the apply mutation consume. Array items are
// matched by normalized name so add/remove/patch of an earn category or benefit
// is detected regardless of formatting drift. No Convex imports — unit-testable.

export type ScalarChange = {
  field: string;
  changeType: "patch";
  current: unknown;
  proposed: unknown;
  confidence: number;
  sourceUrl?: string;
};

export type ArrayChange =
  | { field: string; changeType: "add"; name: string; proposed: NamedItem }
  | { field: string; changeType: "remove"; name: string; current: NamedItem }
  | {
      field: string;
      changeType: "patch";
      name: string;
      current: NamedItem;
      proposed: NamedItem;
    };

export type NamedItem = { name: string; [key: string]: unknown };

export function diffScalar(
  field: string,
  current: unknown,
  proposed: unknown,
  confidence: number,
  sourceUrl?: string,
): ScalarChange | null {
  if (current === proposed) return null;
  return {
    field,
    changeType: "patch",
    current,
    proposed,
    confidence,
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
  };
}

// Normalized match key for benefit / earn-category names. Beyond case and
// whitespace, it strips a leading currency amount and trademark symbols so the
// SAME benefit matches across title conventions — "$500 Southwest Airlines
// Credit", "Southwest Airlines Credit", and "IHG One Rewards Platinum Elite
// Status®" all reduce to a stable key. Without this, changing the stored
// title's dollar prefix reads as remove-old + add-new (churn) instead of a
// quiet no-op. Only a LEADING amount is stripped (titles lead with it);
// amounts mid-title are left alone.
export const norm = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/^(?:up to\s+)?\$[\d,]+(?:\.\d+)?(?=\s|$)\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

// Extraction metadata that rides along on proposed items but is not part of the
// card's actual data — excluded from change detection so a differing confidence
// or sourceUrl alone never looks like a content change.
export const META_KEYS = new Set(["confidence", "sourceUrl", "group"]);

// Stable stringify (sorted keys, metadata excluded) with the name normalized,
// so case/whitespace drift in the name alone is not a meaningful change.
function canonical(item: NamedItem): string {
  const withNormName: Record<string, unknown> = { ...item, name: norm(item.name) };
  const keys = Object.keys(withNormName)
    .filter((k) => !META_KEYS.has(k))
    .sort();
  return JSON.stringify(keys.map((k) => [k, withNormName[k]]));
}

// Mass-removal suspect guard: an extraction that proposes wiping out most of a
// populated array almost certainly failed to read the page (truncated fetch,
// wrong card) rather than the issuer genuinely dropping everything. Suspect iff
// at least 2 removals AND a strict majority of the current items. Single
// removals and 1-item arrays stay normal (a real delisting must be reviewable).
export function isMassRemoval(
  currentCount: number,
  changes: ArrayChange[],
): boolean {
  const removals = changes.filter((c) => c.changeType === "remove").length;
  return removals >= 2 && removals > currentCount / 2;
}

export function diffNamedArray(
  field: string,
  current: NamedItem[],
  proposed: NamedItem[],
): ArrayChange[] {
  const curByName = new Map(current.map((c) => [norm(c.name), c]));
  const propNames = new Set(proposed.map((p) => norm(p.name)));
  const changes: ArrayChange[] = [];

  for (const p of proposed) {
    const key = norm(p.name);
    const c = curByName.get(key);
    if (!c) {
      changes.push({ field, changeType: "add", name: p.name, proposed: p });
    } else if (canonical(c) !== canonical(p)) {
      changes.push({
        field,
        changeType: "patch",
        name: p.name,
        current: c,
        proposed: p,
      });
    }
  }
  for (const c of current) {
    if (!propNames.has(norm(c.name))) {
      changes.push({ field, changeType: "remove", name: c.name, current: c });
    }
  }
  return changes;
}
