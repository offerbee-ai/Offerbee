import { describe, expect, it } from "vitest";
import { gateChange } from "./autoApplyGate";

// The gate decides whether a proposed change auto-applies or falls back to the
// review queue. A change auto-applies only if it is confident, cited, sane, and
// not a removal (removals always go to review — the "never bulk-delete" rule).

const CFG = { confidenceThreshold: 0.85 };

describe("autoApplyGate", () => {
  it("auto-applies a confident, cited, in-bounds scalar change", () => {
    const d = gateChange(
      { field: "annualFee", changeType: "patch", current: 550, proposed: 695, confidence: 0.9, sourceUrl: "https://americanexpress.com" },
      CFG,
    );
    expect(d.autoApply).toBe(true);
  });

  it("routes low-confidence changes to review", () => {
    const d = gateChange(
      { field: "annualFee", changeType: "patch", proposed: 695, confidence: 0.5, sourceUrl: "https://x.com" },
      CFG,
    );
    expect(d.autoApply).toBe(false);
    expect(d.reason).toMatch(/confidence/i);
  });

  it("routes changes with no source URL to review", () => {
    const d = gateChange(
      { field: "annualFee", changeType: "patch", proposed: 695, confidence: 0.95 },
      CFG,
    );
    expect(d.autoApply).toBe(false);
    expect(d.reason).toMatch(/source/i);
  });

  it("rejects an out-of-bounds annual fee", () => {
    const d = gateChange(
      { field: "annualFee", changeType: "patch", proposed: 5000, confidence: 0.95, sourceUrl: "https://x.com" },
      CFG,
    );
    expect(d.autoApply).toBe(false);
    expect(d.reason).toMatch(/bound/i);
  });

  it("auto-applies an in-bounds earn multiplier add (confidence on the item)", () => {
    const d = gateChange(
      { field: "spendBonusCategory", changeType: "add", proposed: { name: "Costco Gas", multiplier: 5, confidence: 0.9, sourceUrl: "https://citi.com" } },
      CFG,
    );
    expect(d.autoApply).toBe(true);
  });

  it("rejects an absurd earn multiplier", () => {
    const d = gateChange(
      { field: "spendBonusCategory", changeType: "add", proposed: { name: "X", multiplier: 50, confidence: 0.95, sourceUrl: "https://citi.com" } },
      CFG,
    );
    expect(d.autoApply).toBe(false);
    expect(d.reason).toMatch(/bound/i);
  });

  it("always routes removals to review", () => {
    const d = gateChange(
      { field: "benefit", changeType: "remove", current: { name: "Old" }, confidence: 1, sourceUrl: "https://citi.com" },
      CFG,
    );
    expect(d.autoApply).toBe(false);
    expect(d.reason).toMatch(/removal/i);
  });

  it("rejects a negative proposed number", () => {
    const d = gateChange(
      { field: "fxFee", changeType: "patch", proposed: -3, confidence: 0.95, sourceUrl: "https://x.com" },
      CFG,
    );
    expect(d.autoApply).toBe(false);
  });

  it("rejects a non-numeric multiplier", () => {
    const d = gateChange(
      { field: "spendBonusCategory", changeType: "add", proposed: { name: "Gas", multiplier: "5", confidence: 0.95, sourceUrl: "https://citi.com" } },
      CFG,
    );
    expect(d.autoApply).toBe(false);
    expect(d.reason).toMatch(/bound|multiplier/i);
  });

  const CFG_STRICT = { confidenceThreshold: 0.85, cardIssuer: "Citi", allowlist: ["citi.com"] };

  it("rejects a citation that is not an issuer-authoritative domain", () => {
    const d = gateChange(
      { field: "annualFee", changeType: "patch", proposed: 0, confidence: 0.95, sourceUrl: "https://somerandomblog.com/citi-costco" },
      CFG_STRICT,
    );
    expect(d.autoApply).toBe(false);
    expect(d.reason).toMatch(/issuer|domain|source/i);
  });

  it("accepts an issuer-domain citation under a strict config", () => {
    const d = gateChange(
      { field: "annualFee", changeType: "patch", proposed: 0, confidence: 0.95, sourceUrl: "https://www.citi.com/credit-cards/x" },
      CFG_STRICT,
    );
    expect(d.autoApply).toBe(true);
  });
});
