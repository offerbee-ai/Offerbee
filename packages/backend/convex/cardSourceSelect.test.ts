import { describe, expect, it } from "vitest";
import { selectSource, cleanIssuerUrl } from "./cardSourceSelect";

// The freshness pipeline prefers a card's official issuer page (cardUrl) as the
// extraction source, but only when the URL is issuer-authoritative. Junk /
// affiliate / missing URLs fall back to open web search.

const ALLOW = ["americanexpress.com", "chase.com", "citi.com", "bankofamerica.com"];

describe("card data source selection", () => {
  it("falls back to web search when there is no cardUrl", () => {
    const r = selectSource({ cardIssuer: "Citi", allowlist: ALLOW });
    expect(r.mode).toBe("web-search");
    expect(r.url).toBeUndefined();
  });

  it("uses the issuer page when the domain is on the allowlist", () => {
    const r = selectSource({
      cardUrl: "https://www.americanexpress.com/us/credit-cards/card/platinum",
      cardIssuer: "American Express",
      allowlist: ALLOW,
    });
    expect(r.mode).toBe("issuer-url");
    expect(r.url).toBe(
      "https://www.americanexpress.com/us/credit-cards/card/platinum",
    );
    expect(r.domain).toBe("americanexpress.com");
  });

  it("matches allowlist entries on a subdomain", () => {
    const r = selectSource({
      cardUrl: "https://creditcards.chase.com/cash-back/freedom/unlimited",
      cardIssuer: "Chase",
      allowlist: ALLOW,
    });
    expect(r.mode).toBe("issuer-url");
    expect(r.domain).toBe("chase.com");
  });

  it("falls back to web search for a junk / affiliate domain", () => {
    const r = selectSource({
      cardUrl: "https://www.nbarizona.com/rewards-visa",
      cardIssuer: "Chase",
      allowlist: ALLOW,
    });
    expect(r.mode).toBe("web-search");
  });

  it("trusts a domain that contains the issuer token even if allowlist is empty", () => {
    const r = selectSource({
      cardUrl: "https://www.citi.com/credit-cards/citi-costco-anywhere-visa-credit-card",
      cardIssuer: "Citi",
      allowlist: [],
    });
    expect(r.mode).toBe("issuer-url");
    expect(r.domain).toBe("citi.com");
  });

  it("does NOT trust a lookalike domain containing the issuer name", () => {
    const r = selectSource({
      cardUrl: "https://chase-rewards.example/apply",
      cardIssuer: "Chase",
      allowlist: [],
    });
    expect(r.mode).toBe("web-search");
  });

  it("falls back when a malformed cardUrl cannot be parsed", () => {
    const r = selectSource({
      cardUrl: "not a url",
      cardIssuer: "Citi",
      allowlist: ALLOW,
    });
    expect(r.mode).toBe("web-search");
  });
});

describe("cleanIssuerUrl", () => {
  it("strips hash and tracking params, keeps meaningful query", () => {
    expect(
      cleanIssuerUrl(
        "https://www.chase.com/personal/credit-cards/sapphire?utm_source=x&utm_campaign=y&iCELL=abc#offers",
      ),
    ).toBe("https://www.chase.com/personal/credit-cards/sapphire?iCELL=abc");
  });

  it("strips ref/affid style params", () => {
    expect(cleanIssuerUrl("https://citi.com/card?ref=aff&affid=1&plan=std")).toBe(
      "https://citi.com/card?plan=std",
    );
  });

  it("returns a clean URL unchanged", () => {
    expect(cleanIssuerUrl("https://citi.com/costco-anywhere")).toBe(
      "https://citi.com/costco-anywhere",
    );
  });

  it("returns null for a malformed URL", () => {
    expect(cleanIssuerUrl("not a url")).toBeNull();
  });
});

import { isTrustedRedirect } from "./cardSourceSelect";

// Redirect trust is stricter than issuer-authority: the allowlist is shared
// across issuers, so a redirect from one issuer's approved page onto another
// allowlisted issuer's domain must NOT be trusted.
describe("isTrustedRedirect", () => {
  const ALLOWLIST = [
    "americanexpress.com",
    "chase.com",
    "citi.com",
    "biltrewards.com",
    "bilt.com",
  ];

  it("trusts a redirect that stays on the same allowlist entry", () => {
    expect(
      isTrustedRedirect(
        "https://www.chase.com/card",
        "https://creditcards.chase.com/card/",
        "Chase",
        ALLOWLIST,
      ),
    ).toBe(true);
  });

  it("trusts a redirect to the issuer's own domain by name token", () => {
    expect(
      isTrustedRedirect(
        "https://www.americanexpress.com/us/card",
        "https://global.americanexpress.com/us/card/",
        "American Express",
        ALLOWLIST,
      ),
    ).toBe(true);
  });

  it("trusts a redirect within a declared domain family", () => {
    expect(
      isTrustedRedirect(
        "https://www.biltrewards.com/card",
        "https://www.bilt.com/card",
        "Wells Fargo",
        ALLOWLIST,
      ),
    ).toBe(true);
  });

  it("rejects a redirect onto a DIFFERENT issuer's allowlisted domain", () => {
    expect(
      isTrustedRedirect(
        "https://www.chase.com/card",
        "https://www.citi.com/credit-cards/",
        "Chase",
        ALLOWLIST,
      ),
    ).toBe(false);
  });

  it("rejects a redirect off the allowlist entirely", () => {
    expect(
      isTrustedRedirect(
        "https://www.chase.com/card",
        "https://chase-offers.example.com/card",
        "Chase",
        ALLOWLIST,
      ),
    ).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isTrustedRedirect("not a url", "https://chase.com/x", "Chase", ALLOWLIST)).toBe(false);
    expect(isTrustedRedirect("https://chase.com/x", "not a url", "Chase", ALLOWLIST)).toBe(false);
  });
});
