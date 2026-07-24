import { describe, expect, it } from "vitest";
import { periodKey, periodEnd } from "./benefitCycles";

describe("benefitCycles (smoke)", () => {
  it("computes calendar period keys (UTC)", () => {
    const jul = Date.UTC(2026, 6, 15); // 2026-07-15
    expect(periodKey("monthly", jul)).toBe("2026-07");
    expect(periodKey("quarterly", jul)).toBe("2026-Q3");
    expect(periodKey("semiannual", jul)).toBe("2026-H2");
    expect(periodKey("annual", jul)).toBe("2026");
  });

  it("computes the reset instant (exclusive period end)", () => {
    const jul = Date.UTC(2026, 6, 15);
    expect(periodEnd("monthly", jul)).toBe(Date.UTC(2026, 7, 1));
    expect(periodEnd("annual", jul)).toBe(Date.UTC(2027, 0, 1));
  });
});

import { expiryRoundupPlan, EXPIRY_ROUNDUP_LEADS } from "./reminderRules";
import type { RoundupBenefit } from "./reminderRules";

const mk = (o: Partial<RoundupBenefit> & { benefitId: string; cycle: RoundupBenefit["cycle"]; amount: number }): RoundupBenefit => ({
  cardKey: "card-a",
  title: "Credit",
  usedAmount: 0,
  usable: true,
  ...o,
});

describe("EXPIRY_ROUNDUP_LEADS", () => {
  it("gives monthly a 14-day heads-up and keeps annual's longer runway", () => {
    expect(EXPIRY_ROUNDUP_LEADS.monthly).toEqual({ headsUp: 14, lastChance: 3 });
    expect(EXPIRY_ROUNDUP_LEADS.annual).toEqual({ headsUp: 30, lastChance: 7 });
  });
});

describe("expiryRoundupPlan", () => {
  it("classifies a monthly credit into headsUp at 14 days but not at 15", () => {
    const at14 = Date.UTC(2026, 6, 18); // Jul 18 -> Aug 1 = 14 days
    const at15 = Date.UTC(2026, 6, 17); // 15 days
    const b = mk({ benefitId: "B1", cycle: "monthly", amount: 25 });
    expect(expiryRoundupPlan([b], at14).headsUp?.count).toBe(1);
    expect(expiryRoundupPlan([b], at15).headsUp).toBeNull();
  });

  it("classifies a monthly credit into lastChance at 3 days (not headsUp)", () => {
    const at3 = Date.UTC(2026, 6, 29); // Jul 29 -> Aug 1 = 3 days
    const plan = expiryRoundupPlan([mk({ benefitId: "B1", cycle: "monthly", amount: 25 })], at3);
    expect(plan.lastChance?.count).toBe(1);
    expect(plan.headsUp).toBeNull();
  });

  it("excludes fully-used and non-usable (grace) benefits", () => {
    const now = Date.UTC(2026, 6, 18);
    const used = mk({ benefitId: "B1", cycle: "monthly", amount: 25, usedAmount: 25 });
    const grace = mk({ benefitId: "B2", cycle: "monthly", amount: 25, usable: false });
    expect(expiryRoundupPlan([used, grace], now).headsUp).toBeNull();
  });

  it("groups several credits into one headsUp tier with totals and soonest", () => {
    const now = Date.UTC(2026, 6, 18); // 14 days for monthly
    const plan = expiryRoundupPlan(
      [
        mk({ benefitId: "B1", cycle: "monthly", amount: 25, usedAmount: 5 }), // 20 left
        mk({ benefitId: "B2", cycle: "monthly", amount: 10 }), // 10 left
      ],
      now,
    );
    expect(plan.headsUp?.count).toBe(2);
    expect(plan.headsUp?.totalRemaining).toBe(30);
    expect(plan.headsUp?.soonestDays).toBe(14);
    expect(plan.headsUp?.monthAnchor).toBe("2026-07");
  });

  it("preserves annual's 30-day heads-up window", () => {
    const now = Date.UTC(2026, 11, 5); // Dec 5 -> Jan 1 = 27 days
    const plan = expiryRoundupPlan([mk({ benefitId: "B9", cycle: "annual", amount: 200, usedAmount: 80 })], now);
    expect(plan.headsUp?.count).toBe(1);
    expect(plan.headsUp?.totalRemaining).toBe(120);
  });

  it("returns nulls when nothing is in a window", () => {
    const now = Date.UTC(2026, 6, 10); // 22 days before monthly reset
    expect(expiryRoundupPlan([mk({ benefitId: "B1", cycle: "monthly", amount: 25 })], now)).toEqual({
      headsUp: null,
      lastChance: null,
    });
  });

  it("populates both tiers from a single call: monthly and annual can share a reset instant yet land in different tiers, since their lead windows differ", () => {
    // Dec 27 -> Jan 1 is 5 days left for BOTH a monthly benefit (whose period
    // always ends at the next month start) and an annual benefit (whose period
    // always ends at the next Jan 1) whenever `now` falls in December. Same
    // daysLeft, but monthly's lastChance lead is 3 (5 > 3 -> headsUp) while
    // annual's lastChance lead is 7 (5 <= 7 -> lastChance). So the two tiers
    // don't require different reset dates -- just cycles whose thresholds
    // diverge at the same daysLeft.
    const now = Date.UTC(2026, 11, 27);
    const plan = expiryRoundupPlan(
      [
        mk({ benefitId: "B1", cycle: "monthly", amount: 25 }),
        mk({ benefitId: "B9", cycle: "annual", amount: 200, usedAmount: 80 }),
      ],
      now,
    );
    expect(plan.headsUp?.count).toBe(1);
    expect(plan.headsUp?.soonestDays).toBe(5);
    expect(plan.lastChance?.count).toBe(1);
    expect(plan.lastChance?.soonestDays).toBe(5);
  });

  it("annual lastChance boundary: 7 days fires lastChance, 8 days falls back to headsUp", () => {
    const at7 = Date.UTC(2026, 11, 25); // Dec 25 -> Jan 1 = 7 days
    const at8 = Date.UTC(2026, 11, 24); // Dec 24 -> Jan 1 = 8 days
    const b = mk({ benefitId: "B9", cycle: "annual", amount: 200 });
    expect(expiryRoundupPlan([b], at7).lastChance?.count).toBe(1);
    expect(expiryRoundupPlan([b], at7).headsUp).toBeNull();
    expect(expiryRoundupPlan([b], at8).headsUp?.count).toBe(1);
    expect(expiryRoundupPlan([b], at8).lastChance).toBeNull();
  });

  it("annual headsUp outer boundary: 30 days fires headsUp, 31 days is outside every window", () => {
    const at30 = Date.UTC(2026, 11, 2); // Dec 2 -> Jan 1 = 30 days
    const at31 = Date.UTC(2026, 11, 1); // Dec 1 -> Jan 1 = 31 days
    const b = mk({ benefitId: "B9", cycle: "annual", amount: 200 });
    expect(expiryRoundupPlan([b], at30).headsUp?.count).toBe(1);
    expect(expiryRoundupPlan([b], at31)).toEqual({ headsUp: null, lastChance: null });
  });
});
