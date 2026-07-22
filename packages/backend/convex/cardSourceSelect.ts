// Picks the extraction source for a card in the freshness pipeline. The stored
// RapidAPI `cardUrl` is preferred — but only when it points at an
// issuer-authoritative domain (on the configured allowlist, or containing the
// issuer's own name token). Junk / affiliate / missing / malformed URLs fall
// back to open web search. Pure module (no Convex imports) — unit-testable.

// Flat (non-discriminated) so callers/tests can read url/domain after checking
// mode without a narrow. `url`/`domain` are set only when mode is "issuer-url".
export type SourceSelection = {
  mode: "issuer-url" | "web-search";
  url?: string;
  domain?: string;
};

// Registrable-ish host: strip a leading "www.". We compare with endsWith against
// allowlist entries so subdomains (creditcards.chase.com) still match chase.com.
function hostOf(url: string): string | null {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.startsWith("www.") ? h.slice(4) : h;
  } catch {
    return null;
  }
}

// Collapse an issuer name to a comparable token: "American Express" ->
// "americanexpress", "Bank of America" -> "bankofamerica".
function issuerToken(issuer: string): string {
  return issuer.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function selectSource(opts: {
  cardUrl?: string;
  cardIssuer: string;
  allowlist: string[];
}): SourceSelection {
  const { cardUrl, cardIssuer, allowlist } = opts;
  if (!cardUrl) return { mode: "web-search" };

  const host = hostOf(cardUrl);
  if (!host) return { mode: "web-search" };

  // 1. Allowlist match (primary, reliable): exact or subdomain.
  const allowed = allowlist
    .map((d) => d.toLowerCase())
    .find((d) => host === d || host.endsWith(`.${d}`));
  if (allowed) return { mode: "issuer-url", url: cardUrl, domain: allowed };

  // 2. Issuer-token containment (secondary): domain carries the issuer's own
  //    name. Guarded by length >= 4 to avoid trivial false positives.
  const token = issuerToken(cardIssuer);
  if (token.length >= 4 && host.replace(/[^a-z0-9]/g, "").includes(token)) {
    return { mode: "issuer-url", url: cardUrl, domain: host };
  }

  return { mode: "web-search" };
}
