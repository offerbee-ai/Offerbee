// Applies a single item-level delta to a stored array (spendBonusCategory /
// benefit), matching by normalized name across any of the given name keys.
// Shared by the freshness auto-apply path and the per-item review confirm so a
// single change is applied without disturbing the rest of the array. Pure —
// unit-testable.

export type ItemDelta = {
  changeType: "add" | "patch" | "remove";
  itemName: string;
  item?: Record<string, unknown>; // the stored-shaped item (absent for remove)
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function applyItemDelta(
  arr: Array<Record<string, any>>,
  delta: ItemDelta,
  nameKeys: string[],
): Array<Record<string, any>> {
  const nameOf = (item: any) =>
    norm(String(nameKeys.map((k) => item?.[k]).find((x) => x != null) ?? ""));
  const key = norm(delta.itemName);

  if (delta.changeType === "remove") return arr.filter((i) => nameOf(i) !== key);

  if (!delta.item) return arr; // add/patch need an item; no-op if missing

  if (delta.changeType === "add") {
    // Idempotent: skip if an item with the same name is already present (guards
    // against confirming a stale "add" after a concurrent auto-apply).
    if (arr.some((i) => nameOf(i) === key)) return arr;
    return [...arr, delta.item];
  }

  // patch: merge over the matched item so LLM-omitted fields survive; if the
  // target is absent, treat it as an upsert (add).
  let found = false;
  const next = arr.map((i) => {
    if (nameOf(i) === key) {
      found = true;
      return { ...i, ...delta.item };
    }
    return i;
  });
  return found ? next : [...arr, delta.item];
}
