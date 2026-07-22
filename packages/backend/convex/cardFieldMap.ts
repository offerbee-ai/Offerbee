// Bridges the stored cardDetails array shapes (spendBonusCategory / benefit) to
// and from the normalized { name, ... } items the diff primitives operate on.
// Pure module — unit-testable. Only defined fields are emitted so canonical
// comparison stays clean.

import type { NamedItem } from "./cardDataDiff";

export function categoryToNamed(c: Record<string, any>): NamedItem {
  const name = String(c.spendBonusCategoryName ?? c.spendBonusCategoryType ?? "");
  const out: NamedItem = { name };
  if (typeof c.earnMultiplier === "number") out.multiplier = c.earnMultiplier;
  if (c.spendBonusCategoryGroup != null) out.group = c.spendBonusCategoryGroup;
  if (typeof c.spendLimit === "number") out.spendLimit = c.spendLimit;
  if (c.spendBonusDesc != null) out.desc = c.spendBonusDesc;
  return out;
}

export function namedToCategory(n: NamedItem): Record<string, unknown> {
  const out: Record<string, unknown> = { spendBonusCategoryName: n.name };
  if (typeof n.multiplier === "number") out.earnMultiplier = n.multiplier;
  if (n.group != null) out.spendBonusCategoryGroup = n.group;
  if (n.desc != null) out.spendBonusDesc = n.desc;
  if (typeof n.spendLimit === "number") {
    out.spendLimit = n.spendLimit;
    out.isSpendLimit = n.spendLimit > 0;
  }
  return out;
}

export function benefitToNamed(b: Record<string, any>): NamedItem {
  const out: NamedItem = { name: String(b.benefitTitle ?? "") };
  if (b.benefitDesc != null) out.desc = b.benefitDesc;
  return out;
}

export function namedToBenefit(n: NamedItem): Record<string, unknown> {
  const out: Record<string, unknown> = { benefitTitle: n.name };
  if (n.desc != null) out.benefitDesc = n.desc;
  return out;
}
