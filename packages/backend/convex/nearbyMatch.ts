// Pure matching logic for the location-based-offer feature: turn a user's
// usable benefits into a ranked, deduped set of brand queries for the geo
// service, and remember which benefits belong to each brand so results can be
// rejoined. No Convex imports → unit-testable. See nearby.ts for the action
// that wires this to the DB and the external geo service.

import { brandForBenefit } from "./benefitMerchants";

// A tracked benefit with unclaimed value this period. Shape is produced by the
// internal query in nearby.ts; kept minimal so this module stays pure.
export type UsableBenefit = {
  id: string;
  cardKey: string;
  benefitTitle?: string; // original API title (mapping key); falls back to title
  title: string; // display name
  cardName: string;
  remaining: number; // dollars unclaimed in the current period (> 0)
  cycle: string;
  resetAt: number; // ms; current period end
};

export type BrandPlan = {
  query: string; // keyword sent to the geo service
  brandKey: string;
  value: number; // summed unclaimed dollars across this brand's benefits
  benefits: UsableBenefit[];
};

// The geo service (/v1/nearby-places) caps `brands` at 25 per request.
export const MAX_BRAND_QUERIES = 25;

// Reduce usable benefits to ranked brand queries. Only "store" (walk-in) brands
// are included — online/airport mappings are skipped here since they can't be
// geofenced to a storefront. Brands are ranked by summed unclaimed value so the
// most worthwhile ones survive the 25-query cap, then truncated.
export function planBrandQueries(
  benefits: UsableBenefit[],
  max: number = MAX_BRAND_QUERIES,
): BrandPlan[] {
  const byBrand = new Map<string, BrandPlan>();
  for (const b of benefits) {
    if (b.remaining <= 0) continue;
    const mapping = brandForBenefit(b.cardKey, b.benefitTitle ?? b.title);
    if (!mapping || mapping.kind !== "store") continue;
    const existing = byBrand.get(mapping.brandKey);
    if (existing) {
      existing.value += b.remaining;
      existing.benefits.push(b);
    } else {
      byBrand.set(mapping.brandKey, {
        query: mapping.query,
        brandKey: mapping.brandKey,
        value: b.remaining,
        benefits: [b],
      });
    }
  }
  return [...byBrand.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.max(0, max));
}
