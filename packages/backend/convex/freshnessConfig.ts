// Issuer-domain allowlist shared by the freshness pipeline (source selection +
// auto-apply citation gate) and the review surface (bulk confirm's citation
// requirement). Pure module — no Convex imports — so mutation files can import
// it without pulling in action code.

export const DEFAULT_ALLOWLIST = [
  "americanexpress.com",
  "chase.com",
  "citi.com",
  "bankofamerica.com",
  "capitalone.com",
  "wellsfargo.com",
  "discover.com",
  "usbank.com",
  "barclaycardus.com",
  "biltrewards.com",
  // biltrewards.com/card 308-redirects here (2025 rebrand); both are Bilt's.
  "bilt.com",
  // Hosts the official page for the Amex Platinum for Schwab co-brand.
  "schwab.com",
];

// Domains that belong to the same issuer but don't share a registrable domain
// — a redirect between family members is trusted (biltrewards.com/card 308s to
// bilt.com). Grouped, so a redirect between two UNRELATED allowlisted issuers
// (chase.com -> citi.com) is still rejected.
export const DOMAIN_FAMILIES: string[][] = [["biltrewards.com", "bilt.com"]];

// The configured allowlist: ISSUER_DOMAIN_ALLOWLIST (comma-separated) when set,
// else the default. Callers pass process.env.ISSUER_DOMAIN_ALLOWLIST.
export function issuerAllowlist(envValue: string | undefined): string[] {
  return (
    envValue ? envValue.split(",").map((s) => s.trim()) : DEFAULT_ALLOWLIST
  ).filter(Boolean);
}
