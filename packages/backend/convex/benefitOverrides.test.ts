import { describe, expect, it } from "vitest";
import { suggestCredits } from "./benefitParser";

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
