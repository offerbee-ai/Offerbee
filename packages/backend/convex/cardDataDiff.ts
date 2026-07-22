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

const norm = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

// Stable stringify (sorted keys) with the name normalized, so case/whitespace
// drift in the name alone is not counted as a meaningful change.
function canonical(item: NamedItem): string {
  const withNormName: Record<string, unknown> = { ...item, name: norm(item.name) };
  const keys = Object.keys(withNormName).sort();
  return JSON.stringify(keys.map((k) => [k, withNormName[k]]));
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
