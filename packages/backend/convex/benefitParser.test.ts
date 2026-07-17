import { describe, expect, it } from "vitest";
import { parseBenefitCredit } from "./benefitParser";

describe("parseBenefitCredit — annual totals near a sub-annual cycle phrase", () => {
  it("CSR DoorDash: '$300 annually … $25 each month' → $25/monthly (the prod bug)", () => {
    const p = parseBenefitCredit({
      benefitTitle: "DoorDash",
      benefitDesc:
        "Up to $300 annually in monthly DoorDash promos. Get up to $25 each " +
        "month to spend on DoorDash, which includes a $5 monthly promo to " +
        "spend on restaurant orders and two $10 promos each month to save on " +
        "groceries, retail orders and more.",
    });
    expect(p).toMatchObject({ amount: 25, cycle: "monthly" });
  });

  it("divides a lone year total by the period count", () => {
    const p = parseBenefitCredit({
      benefitTitle: "Streaming",
      benefitDesc: "Up to $300 annually in monthly streaming credits.",
    });
    expect(p).toMatchObject({ amount: 25, cycle: "monthly" });
  });

  it("'per year' and '/yr' also mark a year total", () => {
    expect(
      parseBenefitCredit({
        benefitTitle: "Rideshare",
        benefitDesc: "Receive $120 per year in monthly rideshare credits.",
      }),
    ).toMatchObject({ amount: 10, cycle: "monthly" });
  });
});

describe("parseBenefitCredit — regressions", () => {
  it("keeps the worked example: quarterly per-period chunk wins", () => {
    const p = parseBenefitCredit({
      benefitTitle: "$300 lululemon Credit",
      benefitDesc: "Up to $75 in statement credits each quarter.",
    });
    expect(p).toMatchObject({ amount: 75, cycle: "quarterly", confidence: "high" });
  });

  it("plain annual credits are untouched", () => {
    const p = parseBenefitCredit({
      benefitTitle: "$300 Annual Travel Credit",
      benefitDesc: "$300 annually as statement credits for travel purchases.",
    });
    expect(p).toMatchObject({ amount: 300, cycle: "annual" });
  });

  it("per-month figure with annual title stays per-period + high confidence", () => {
    const p = parseBenefitCredit({
      benefitTitle: "$300 Digital Entertainment Credit",
      benefitDesc: "Up to $25 per month in statement credits.",
    });
    expect(p).toMatchObject({ amount: 25, cycle: "monthly", confidence: "high" });
  });

  it("still masks spend requirements", () => {
    const p = parseBenefitCredit({
      benefitTitle: "Travel Credit",
      benefitDesc: "$250 statement credit each year after you spend $75,000.",
    });
    expect(p).toMatchObject({ amount: 250, cycle: "annual" });
  });
});
