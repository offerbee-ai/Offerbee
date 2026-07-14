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

import { pickBucket, expiryCandidate, EXPIRY_BUCKETS } from "./reminderRules";

describe("pickBucket (smallest bucket >= daysLeft; arrays ascending)", () => {
  it("selects the tightest window entered", () => {
    expect(pickBucket(4, [7, 30])).toBe(7);
    expect(pickBucket(27, [7, 30])).toBe(30);
    expect(pickBucket(3, [3])).toBe(3);
    expect(pickBucket(0, [3])).toBe(3);
  });
  it("returns null outside all windows or when already past", () => {
    expect(pickBucket(31, [7, 30])).toBeNull();
    expect(pickBucket(4, [3])).toBeNull();
    expect(pickBucket(-1, [3])).toBeNull();
  });
  it("annual buckets are ascending", () => {
    expect(EXPIRY_BUCKETS.annual).toEqual([7, 30]);
  });
});

describe("expiryCandidate", () => {
  it("fires a monthly nudge 3 days before reset", () => {
    const now = Date.UTC(2026, 6, 29); // Jul 29 -> Aug 1 reset = 3 days
    const c = expiryCandidate({ benefitId: "B1", cycle: "monthly", amount: 25, usedAmount: 0, now });
    expect(c).toEqual({
      dedupKey: "credit_expiring:B1:2026-07:3",
      periodKey: "2026-07",
      bucket: 3,
      daysLeft: 3,
      remaining: 25,
    });
  });
  it("does not fire when fully used", () => {
    const now = Date.UTC(2026, 6, 29);
    expect(expiryCandidate({ benefitId: "B1", cycle: "monthly", amount: 25, usedAmount: 25, now })).toBeNull();
  });
  it("does not fire outside the bucket window", () => {
    const now = Date.UTC(2026, 6, 20); // 12 days before reset
    expect(expiryCandidate({ benefitId: "B1", cycle: "monthly", amount: 25, usedAmount: 0, now })).toBeNull();
  });
  it("fires the annual 30-day nudge with partial usage", () => {
    const now = Date.UTC(2026, 11, 5); // Dec 5 -> Jan 1 = 27 days
    const c = expiryCandidate({ benefitId: "B9", cycle: "annual", amount: 200, usedAmount: 80, now });
    expect(c?.bucket).toBe(30);
    expect(c?.remaining).toBe(120);
    expect(c?.dedupKey).toBe("credit_expiring:B9:2026:30");
  });
  it("fires the annual 7-day nudge closer in", () => {
    const now = Date.UTC(2026, 11, 28); // Dec 28 -> Jan 1 = 4 days
    const c = expiryCandidate({ benefitId: "B9", cycle: "annual", amount: 200, usedAmount: 0, now });
    expect(c?.bucket).toBe(7);
  });
});
