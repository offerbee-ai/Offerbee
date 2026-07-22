// Parses the LLM's card-profile response into a normalized shape the diff
// primitives consume. The model returns JSON, sometimes wrapped in prose or a
// markdown fence; we extract the object, coerce annualFee to a number, and map
// the two arrays to { name, ... } items (benefits' `title` -> `name`) so
// cardDataDiff can match them. Returns null when no usable JSON is present.
// Pure module — unit-testable.

import type { NamedItem } from "./cardDataDiff";

export type ExtractedProfile = {
  annualFee?: number;
  earnCategories: NamedItem[];
  benefits: NamedItem[];
};

function toNum(x: unknown): number | undefined {
  if (typeof x === "number") return Number.isFinite(x) ? x : undefined;
  if (typeof x === "string") {
    const n = parseFloat(x.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function parseExtraction(raw: string): ExtractedProfile | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj: Record<string, any>;
  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    obj = parsed;
  } catch {
    return null;
  }

  const profile: ExtractedProfile = { earnCategories: [], benefits: [] };

  const af = toNum(obj.annualFee?.value ?? obj.annualFee);
  if (af !== undefined) profile.annualFee = af;

  if (Array.isArray(obj.earnCategories)) {
    profile.earnCategories = obj.earnCategories
      .filter((c: any) => c && typeof c.name === "string")
      .map((c: any) => ({ ...c }));
  }

  if (Array.isArray(obj.benefits)) {
    profile.benefits = obj.benefits
      .map((b: any): NamedItem | null => {
        const name =
          typeof b?.name === "string"
            ? b.name
            : typeof b?.title === "string"
              ? b.title
              : undefined;
        if (!name) return null;
        const { title: _title, ...rest } = b ?? {};
        return { ...rest, name };
      })
      .filter((b: NamedItem | null): b is NamedItem => b !== null);
  }

  return profile;
}
