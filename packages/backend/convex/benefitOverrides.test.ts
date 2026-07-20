import { describe, expect, it } from "vitest";
import { suggestCredits } from "./benefitParser";
import { staleOverrideTitles, validateOverrides } from "./benefitOverrides";
import shippedConfig from "./benefitOverrides.json";

// Real catalog text for CSR StubHub — says "annual", omits the $150 Jan–Jun /
// $150 Jul–Dec split that Chase's own terms specify.
const STUBHUB = {
  benefitTitle: "StubHub",
  benefitDesc:
    "Get up to $300 in annual statement credits on concert and event tickets " +
    "purchased on StubHub and viagogo",
};

describe("curated benefit overrides", () => {
  it("without a cardKey, the raw text parse stands ($300 annual)", () => {
    const [s] = suggestCredits([STUBHUB]);
    expect(s).toMatchObject({ amount: 300, cycle: "annual" });
  });

  it("CSR StubHub overrides to $150 semiannual (issuer terms)", () => {
    const [s] = suggestCredits([STUBHUB], "chase-sapphirereserve");
    expect(s).toMatchObject({
      amount: 150,
      cycle: "semiannual",
      confidence: "high",
    });
  });

  it("other cards' StubHub benefits are NOT overridden", () => {
    const [s] = suggestCredits([STUBHUB], "amex-platinum");
    expect(s).toMatchObject({ amount: 300, cycle: "annual" });
  });

  it("matches titles case-insensitively (upstream casing drift)", () => {
    const [s] = suggestCredits(
      [{ ...STUBHUB, benefitTitle: "  Stubhub " }],
      "chase-sapphirereserve",
    );
    expect(s).toMatchObject({ amount: 150, cycle: "semiannual" });
  });

  it("benefits without an override pass through unchanged", () => {
    const [s] = suggestCredits(
      [
        {
          benefitTitle: "$300 Annual Travel Credit",
          benefitDesc: "$300 annually as statement credits for travel purchases.",
        },
      ],
      "chase-sapphirereserve",
    );
    expect(s).toMatchObject({ amount: 300, cycle: "annual" });
  });
});

describe("staleOverrideTitles — upstream rename detection", () => {
  it("reports an override whose title no longer parses from the card", () => {
    expect(
      staleOverrideTitles("chase-sapphirereserve", ["StubHub Credit", "DoorDash"]),
    ).toEqual(["StubHub"]);
  });

  it("empty when the title is present (any casing)", () => {
    expect(staleOverrideTitles("chase-sapphirereserve", ["stubhub"])).toEqual([]);
  });

  it("empty for cards with no overrides", () => {
    expect(staleOverrideTitles("amex-platinum", [])).toEqual([]);
  });
});

describe("validateOverrides — config-file validation", () => {
  it("accepts the shipped benefitOverrides.json", () => {
    const v = validateOverrides(shippedConfig);
    expect(v["chase-sapphirereserve"]["StubHub"]).toEqual({
      amount: 150,
      cycle: "semiannual",
    });
  });

  it("rejects an unknown cycle", () => {
    expect(() =>
      validateOverrides({ card: { Benefit: { cycle: "biweekly" } } }),
    ).toThrow(/card\/Benefit: cycle must be one of/);
  });

  it("rejects non-positive or non-numeric amounts", () => {
    expect(() =>
      validateOverrides({ card: { Benefit: { amount: 0 } } }),
    ).toThrow(/amount must be a positive number/);
    expect(() =>
      validateOverrides({ card: { Benefit: { amount: "150" } } }),
    ).toThrow(/amount must be a positive number/);
  });

  it("rejects an override that sets neither amount nor cycle", () => {
    expect(() =>
      validateOverrides({ card: { Benefit: { note: "just a note" } } }),
    ).toThrow(/must set amount and\/or cycle/);
  });

  it("rejects a non-object root", () => {
    expect(() => validateOverrides([])).toThrow(/root must be an object/);
  });
});
