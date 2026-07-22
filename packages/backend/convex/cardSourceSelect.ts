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

// Host without a leading "www.". Null on a malformed URL.
export function hostOf(url: string): string | null {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.startsWith("www.") ? h.slice(4) : h;
  } catch {
    return null;
  }
}

// Second-level label of a host: "creditcards.chase.com" -> "chase",
// "chase-rewards.example" -> "chase-rewards".
function sld(host: string): string {
  const parts = host.split(".");
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

// Collapse an issuer name to a comparable token: "American Express" ->
// "americanexpress", "Bank of America" -> "bankofamerica".
function issuerToken(issuer: string): string {
  return issuer.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Whether a host is issuer-authoritative: on the allowlist (exact or subdomain)
// or its second-level label EXACTLY equals the issuer token. Exact-SLD (not
// substring) rejects lookalikes like "chase-rewards.example". Shared by the
// source selector and the auto-apply gate's citation check.
export function isIssuerAuthoritativeHost(
  host: string,
  cardIssuer: string,
  allowlist: string[],
): string | null {
  const allowed = allowlist
    .map((d) => d.toLowerCase())
    .find((d) => host === d || host.endsWith(`.${d}`));
  if (allowed) return allowed;

  const token = issuerToken(cardIssuer);
  if (token.length >= 4 && sld(host) === token) return host;
  return null;
}

export function isIssuerAuthoritativeUrl(
  url: string | undefined,
  cardIssuer: string,
  allowlist: string[],
): boolean {
  if (!url) return false;
  const host = hostOf(url);
  return host ? isIssuerAuthoritativeHost(host, cardIssuer, allowlist) !== null : false;
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

  const domain = isIssuerAuthoritativeHost(host, cardIssuer, allowlist);
  if (domain) return { mode: "issuer-url", url: cardUrl, domain };

  return { mode: "web-search" };
}
