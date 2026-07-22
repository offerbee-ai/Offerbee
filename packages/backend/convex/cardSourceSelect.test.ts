import { describe, expect, it } from "vitest";
import { selectSource } from "./cardSourceSelect";

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

  it("falls back when a malformed cardUrl cannot be parsed", () => {
    const r = selectSource({
      cardUrl: "not a url",
      cardIssuer: "Citi",
      allowlist: ALLOW,
    });
    expect(r.mode).toBe("web-search");
  });
});
