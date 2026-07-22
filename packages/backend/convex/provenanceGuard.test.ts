import { describe, expect, it } from "vitest";
import { AUTHORITATIVE_SOURCES, guardApiContent } from "./provenanceGuard";

// The RapidAPI refresh (catalogSync.saveCardDetail) full-overwrites a card's
// stored content. Without a guard it clobbers a field that a human confirmed
// (source "manual") or the verifier web-checked (source "web") back to the
// stale API value. guardApiContent strips those fields from the incoming API
// patch so the authoritative value survives.

describe("provenance guard for API refreshes", () => {
  it("leaves content untouched when there is no provenance", () => {
    const content = { annualFee: 695, cardName: "The Platinum Card" };
    const { patch, preserved } = guardApiContent(content, undefined);
    expect(patch).toEqual(content);
    expect(preserved).toEqual([]);
  });

  it("does NOT protect a field whose provenance source is rapidapi", () => {
    const content = { annualFee: 695 };
    const { patch, preserved } = guardApiContent(content, [
      { field: "annualFee", source: "rapidapi", verifiedAt: 1 },
    ]);
    expect(patch).toEqual({ annualFee: 695 });
    expect(preserved).toEqual([]);
  });

  it("preserves a web-verified field from the incoming API value", () => {
    const content = { annualFee: 0, cardName: "The Platinum Card" };
    const { patch, preserved } = guardApiContent(content, [
      { field: "annualFee", source: "web", verifiedAt: 1 },
    ]);
    expect(patch).toEqual({ cardName: "The Platinum Card" });
    expect("annualFee" in patch).toBe(false);
    expect(preserved).toEqual(["annualFee"]);
  });

  it("preserves a human-confirmed (manual) field", () => {
    const content = { signupBonusSpend: 6000 };
    const { patch, preserved } = guardApiContent(content, [
      { field: "signupBonusSpend", source: "manual", verifiedAt: 1 },
    ]);
    expect(patch).toEqual({});
    expect(preserved).toEqual(["signupBonusSpend"]);
  });

  it("pins only authoritative fields when sources are mixed", () => {
    const content = { annualFee: 695, signupBonusSpend: 6000, fxFee: 0 };
    const { patch, preserved } = guardApiContent(content, [
      { field: "annualFee", source: "web", verifiedAt: 2 },
      { field: "signupBonusSpend", source: "rapidapi", verifiedAt: 1 },
    ]);
    expect(patch).toEqual({ signupBonusSpend: 6000, fxFee: 0 });
    expect(preserved).toEqual(["annualFee"]);
  });

  it("does not report a pinned field that is absent from incoming content", () => {
    const content = { cardName: "X" };
    const { patch, preserved } = guardApiContent(content, [
      { field: "annualFee", source: "web", verifiedAt: 1 },
    ]);
    expect(patch).toEqual({ cardName: "X" });
    expect(preserved).toEqual([]);
  });

  it("treats web and manual as the authoritative sources", () => {
    expect(AUTHORITATIVE_SOURCES.has("web")).toBe(true);
    expect(AUTHORITATIVE_SOURCES.has("manual")).toBe(true);
    expect(AUTHORITATIVE_SOURCES.has("rapidapi")).toBe(false);
  });
});
