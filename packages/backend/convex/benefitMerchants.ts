// Curated mapping from a tracked benefit to a physical merchant brand, so a
// credit (e.g. Amex Gold "Dunkin' Credit") can be resolved to nearby store
// locations for the location-based-offer feature. Mirrors benefitOverrides.ts:
// the data is CONFIG (benefitMerchants.json), keyed by (cardKey, benefitTitle)
// exactly as suggestCredits produces the title, validated at module load so a
// malformed edit fails deploy/tests instead of silently misbehaving. Pure
// module (no Convex imports) → unit-testable.
//
// Only benefits with a PHYSICAL, walk-in redemption should map to a store
// brand. Delivery/rides/streaming credits (Grubhub, Uber, Disney+) have no
// storefront: give them `kind: "online"` so location matching skips them while
// keeping the mapping documented. `kind: "airport"` is reserved for travel
// credits resolved via airport detection rather than a brand query.
//
// This deliberately keeps merchant data OUT of user rows (like overrides): the
// catalog can change without ever touching userBenefits.

import rawMerchants from "./benefitMerchants.json";

export type BrandKind = "store" | "online" | "airport";

export type BrandMapping = {
  brandKey: string; // stable slug, groups locations of one brand
  query: string; // keyword sent to the geo service's brand search
  kind: BrandKind; // defaults to "store"
};

const KINDS: BrandKind[] = ["store", "online", "airport"];

// Validate the JSON config's shape; throws `cardKey/title: problem` so a bad
// edit is caught at deploy/test time. Exported for direct testing.
export function validateBenefitMerchants(
  raw: unknown,
): Record<string, Record<string, BrandMapping>> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new Error("benefitMerchants.json: root must be an object");
  const out: Record<string, Record<string, BrandMapping>> = {};
  for (const [cardKey, byTitle] of Object.entries(raw)) {
    if (!cardKey.trim()) throw new Error("benefitMerchants.json: empty cardKey");
    if (typeof byTitle !== "object" || byTitle === null || Array.isArray(byTitle))
      throw new Error(`benefitMerchants.json: ${cardKey}: must be an object`);
    out[cardKey] = {};
    for (const [title, m] of Object.entries(byTitle as Record<string, any>)) {
      const at = `benefitMerchants.json: ${cardKey}/${title}`;
      if (!title.trim()) throw new Error(`${at}: empty benefit title`);
      if (typeof m !== "object" || m === null)
        throw new Error(`${at}: mapping must be an object`);
      const { brandKey, query, kind } = m;
      if (typeof brandKey !== "string" || !brandKey.trim())
        throw new Error(`${at}: brandKey must be a non-empty string`);
      if (typeof query !== "string" || !query.trim())
        throw new Error(`${at}: query must be a non-empty string`);
      if (kind !== undefined && !KINDS.includes(kind))
        throw new Error(`${at}: kind must be one of ${KINDS.join("/")} (got "${kind}")`);
      out[cardKey][title] = {
        brandKey: brandKey.trim(),
        query: query.trim(),
        kind: (kind as BrandKind) ?? "store",
      };
    }
  }
  return out;
}

const BENEFIT_MERCHANTS = validateBenefitMerchants(rawMerchants);

// Titles matched trimmed + case-insensitively, same as benefitOverrides, so
// upstream casing drift can't silently drop a mapping.
const norm = (s: string) => s.trim().toLowerCase();

const NORMALIZED: Record<string, Map<string, BrandMapping>> = Object.fromEntries(
  Object.entries(BENEFIT_MERCHANTS).map(([cardKey, byTitle]) => [
    cardKey,
    new Map(Object.entries(byTitle).map(([title, m]) => [norm(title), m])),
  ]),
);

// Resolve a benefit to its brand mapping, or null if unmapped. `benefitTitle`
// is the original API title (userBenefits.benefitTitle); callers should fall
// back to the display title when the API title is absent.
export function brandForBenefit(
  cardKey: string | undefined,
  benefitTitle: string | undefined,
): BrandMapping | null {
  if (!cardKey || !benefitTitle) return null;
  return NORMALIZED[cardKey]?.get(norm(benefitTitle)) ?? null;
}
