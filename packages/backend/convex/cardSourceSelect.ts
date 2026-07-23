// Picks the extraction source for a card in the freshness pipeline. The stored
// RapidAPI `cardUrl` is preferred — but only when it points at an
// issuer-authoritative domain (on the configured allowlist, or containing the
// issuer's own name token). Junk / affiliate / missing / malformed URLs fall
// back to open web search. Pure module (no Convex imports) — unit-testable.

import { DOMAIN_FAMILIES } from "./freshnessConfig";

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

// The allowlist entry a host matches (exact or subdomain), or null.
function allowlistEntryOf(host: string, allowlist: string[]): string | null {
  return (
    allowlist
      .map((d) => d.toLowerCase())
      .find((d) => host === d || host.endsWith(`.${d}`)) ?? null
  );
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
  const allowed = allowlistEntryOf(host, allowlist);
  if (allowed) return allowed;

  const token = issuerToken(cardIssuer);
  if (token.length >= 4 && sld(host) === token) return host;
  return null;
}

// Whether a fetch that started on an approved issuer URL may still be trusted
// after redirects. Stricter than isIssuerAuthoritativeUrl: the allowlist is
// shared across issuers, so landing on a DIFFERENT issuer's allowlisted domain
// (chase.com -> citi.com) must not pass. Trusted when the final host matches
// the card issuer's own name token, stays on the original URL's allowlist
// entry, or moves within a declared same-issuer domain family
// (biltrewards.com -> bilt.com).
export function isTrustedRedirect(
  originalUrl: string,
  finalUrl: string,
  cardIssuer: string,
  allowlist: string[],
): boolean {
  const oHost = hostOf(originalUrl);
  const fHost = hostOf(finalUrl);
  if (!oHost || !fHost) return false;

  const token = issuerToken(cardIssuer);
  if (token.length >= 4 && sld(fHost) === token) return true;

  const oEntry = allowlistEntryOf(oHost, allowlist);
  const fEntry = allowlistEntryOf(fHost, allowlist);
  if (!oEntry || !fEntry) return false;
  if (oEntry === fEntry) return true;
  return DOMAIN_FAMILIES.some(
    (fam) => fam.includes(oEntry) && fam.includes(fEntry),
  );
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

// Canonicalize an issuer URL before storing it (URL self-heal): drop the hash
// and tracking params so the stored cardUrl is stable across extractions.
export function cleanIssuerUrl(url: string): string | null {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(ref|referrer|affid|cid)$/i.test(key))
        u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return null;
  }
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
