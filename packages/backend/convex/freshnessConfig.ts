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
];

// The configured allowlist: ISSUER_DOMAIN_ALLOWLIST (comma-separated) when set,
// else the default. Callers pass process.env.ISSUER_DOMAIN_ALLOWLIST.
export function issuerAllowlist(envValue: string | undefined): string[] {
  return (
    envValue ? envValue.split(",").map((s) => s.trim()) : DEFAULT_ALLOWLIST
  ).filter(Boolean);
}
