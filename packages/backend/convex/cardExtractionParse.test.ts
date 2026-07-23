import { describe, expect, it } from "vitest";
import { parseExtraction } from "./cardExtractionParse";

// The LLM returns a card profile as JSON, sometimes wrapped in prose or a
// markdown fence. parseExtraction pulls the object out and normalizes the two
// arrays into { name, ... } items so cardDataDiff can match them. Returns null
// when no usable JSON is present.

describe("parseExtraction", () => {
  it("returns null when there is no JSON object", () => {
    expect(parseExtraction("I could not find the terms.")).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(parseExtraction("{ annualFee: }")).toBeNull();
  });

  it("parses a clean object and coerces annualFee to a number", () => {
    const p = parseExtraction('{"annualFee": {"value": "695", "confidence": 0.9}}');
    expect(p?.annualFee).toBe(695);
  });

  it("captures annualFee confidence and sourceUrl for the gate", () => {
    const p = parseExtraction(
      '{"annualFee": {"value": 695, "confidence": 0.92, "sourceUrl": "https://americanexpress.com"}}',
    );
    expect(p?.annualFeeConfidence).toBe(0.92);
    expect(p?.annualFeeSourceUrl).toBe("https://americanexpress.com");
  });

  it("extracts JSON from a markdown fence with surrounding prose", () => {
    const raw =
      "Here are the terms:\n```json\n" +
      '{"annualFee": {"value": 0, "confidence": 1}}\n' +
      "```\nHope that helps!";
    expect(parseExtraction(raw)?.annualFee).toBe(0);
  });

  it("normalizes earnCategories into name-keyed items for the differ", () => {
    const raw = JSON.stringify({
      earnCategories: [
        { name: "Costco Gas", multiplier: 5, sourceUrl: "https://citi.com", confidence: 0.9 },
      ],
    });
    const p = parseExtraction(raw);
    expect(p?.earnCategories).toEqual([
      { name: "Costco Gas", multiplier: 5, sourceUrl: "https://citi.com", confidence: 0.9 },
    ]);
  });

  it("maps a benefit's title to name so it matches the stored shape", () => {
    const raw = JSON.stringify({
      benefits: [{ title: "Lounge Access", desc: "Centurion", confidence: 0.8 }],
    });
    const p = parseExtraction(raw);
    expect(p?.benefits?.[0]).toMatchObject({ name: "Lounge Access", desc: "Centurion" });
  });

  it("leaves arrays undefined when absent (not an empty removal set)", () => {
    const p = parseExtraction('{"annualFee": {"value": 95, "confidence": 1}}');
    expect(p?.earnCategories).toBeUndefined();
    expect(p?.benefits).toBeUndefined();
  });

  it("keeps an explicit empty array as empty (real removal signal)", () => {
    const p = parseExtraction('{"earnCategories": []}');
    expect(p?.earnCategories).toEqual([]);
  });

  it("coerces string multiplier / spendLimit to numbers so bounds apply", () => {
    const p = parseExtraction(
      '{"earnCategories": [{"name": "Gas", "multiplier": "5", "spendLimit": "7000", "confidence": 0.9}]}',
    );
    expect(p?.earnCategories?.[0]).toMatchObject({ multiplier: 5, spendLimit: 7000 });
  });

  it("coerces thousands-formatted and currency spend limits correctly", () => {
    const p = parseExtraction(
      '{"earnCategories": [{"name": "Gas", "multiplier": 4, "spendLimit": "$7,000", "confidence": 0.9}]}',
    );
    // The [^0-9.-] strip already removes the comma and "$": "$7,000" -> 7000.
    expect(p?.earnCategories?.[0]).toMatchObject({ spendLimit: 7000 });
  });
});

describe("fxFee and signupBonus coverage", () => {
  it("parses fxFee with confidence and sourceUrl", () => {
    const p = parseExtraction(
      '{"fxFee": {"value": 3, "confidence": 0.9, "sourceUrl": "https://chase.com/x"}}',
    );
    expect(p?.fxFee).toBe(3);
    expect(p?.fxFeeConfidence).toBe(0.9);
    expect(p?.fxFeeSourceUrl).toBe("https://chase.com/x");
  });

  it("coerces a string fxFee", () => {
    const p = parseExtraction('{"fxFee": {"value": "3%"}}');
    expect(p?.fxFee).toBe(3);
  });

  it("leaves fxFee undefined when omitted", () => {
    const p = parseExtraction('{"annualFee": {"value": 95}}');
    expect(p?.fxFee).toBeUndefined();
  });

  it("parses the signupBonus block and splits lengthOfPeriod", () => {
    const p = parseExtraction(
      '{"signupBonus": {"amount": 60000, "spend": "4,000", "lengthOfPeriod": "3 months", "desc": "60k after $4k", "confidence": 0.92, "sourceUrl": "https://chase.com/sapphire"}}',
    );
    expect(p?.signupBonus).toMatchObject({
      amount: 60000,
      spend: 4000,
      length: 3,
      lengthPeriod: "months",
      desc: "60k after $4k",
      confidence: 0.92,
      sourceUrl: "https://chase.com/sapphire",
    });
  });

  it("prefers explicit length/lengthPeriod over lengthOfPeriod", () => {
    const p = parseExtraction(
      '{"signupBonus": {"amount": 1, "length": 90, "lengthPeriod": "days", "lengthOfPeriod": "3 months"}}',
    );
    expect(p?.signupBonus).toMatchObject({ length: 90, lengthPeriod: "days" });
  });

  it("leaves signupBonus undefined when omitted or empty", () => {
    expect(parseExtraction('{"annualFee": {"value": 0}}')?.signupBonus).toBeUndefined();
    expect(parseExtraction('{"signupBonus": {}}')?.signupBonus).toBeUndefined();
  });
});

// A signupBonus object carrying only metadata (confidence/sourceUrl) verifies
// nothing — it must be dropped so downstream presence checks (external
// submissions' empty-profile guard, evaluatedFields) don't count it.
describe("metadata-only signupBonus", () => {
  it("drops a signupBonus with no value fields", () => {
    const p = parseExtraction(
      JSON.stringify({
        signupBonus: { confidence: 0.9, sourceUrl: "https://chase.com/x" },
      }),
    );
    expect(p).not.toBeNull();
    expect(p!.signupBonus).toBeUndefined();
  });

  it("keeps a signupBonus with at least one value field", () => {
    const p = parseExtraction(
      JSON.stringify({
        signupBonus: { amount: 60000, confidence: 0.9 },
      }),
    );
    expect(p!.signupBonus).toEqual({ amount: 60000, confidence: 0.9 });
  });
});

// Empty strings are absence, not values — "" as desc/lengthPeriod must not
// count as a reported field (or it would propose wiping the stored value).
describe("empty-string signupBonus fields", () => {
  it("drops a signupBonus whose only 'values' are empty strings", () => {
    const p = parseExtraction(
      JSON.stringify({
        signupBonus: { desc: "", lengthPeriod: "  ", confidence: 0.9 },
      }),
    );
    expect(p!.signupBonus).toBeUndefined();
  });
});

// A non-empty array whose every entry lacked a usable name filters to empty —
// that is a failed read, not the explicit "[] = page lists none" removal
// signal, and must stay unreported.
describe("filtered-to-empty arrays", () => {
  it("leaves benefits unreported when all entries are nameless", () => {
    const p = parseExtraction(
      JSON.stringify({ benefits: [{ desc: "no title here" }] }),
    );
    expect(p!.benefits).toBeUndefined();
  });

  it("leaves earnCategories unreported when all entries are nameless", () => {
    const p = parseExtraction(
      JSON.stringify({ earnCategories: [{ multiplier: 3 }] }),
    );
    expect(p!.earnCategories).toBeUndefined();
  });

  it("keeps explicitly empty arrays as a removal signal", () => {
    const p = parseExtraction(
      JSON.stringify({ benefits: [], earnCategories: [] }),
    );
    expect(p!.benefits).toEqual([]);
    expect(p!.earnCategories).toEqual([]);
  });
});

// Whitespace-only names normalize to an empty identity — same failed-read
// treatment as nameless entries.
describe("whitespace-only item names", () => {
  it("filters them and leaves the array unreported when nothing survives", () => {
    const p = parseExtraction(
      JSON.stringify({
        earnCategories: [{ name: "   ", multiplier: 3 }],
        benefits: [{ title: " ", desc: "x" }],
      }),
    );
    expect(p!.earnCategories).toBeUndefined();
    expect(p!.benefits).toBeUndefined();
  });
});
