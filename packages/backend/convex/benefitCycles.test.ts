import { describe, expect, it } from "vitest";
import {
  periodKey,
  periodStart,
  postingLagPeriodKey,
  POSTING_LAG_GRACE_MS,
} from "./benefitCycles";

const d = (y: number, m: number, day: number, hour = 0) =>
  Date.UTC(y, m, day, hour);

describe("periodStart", () => {
  it("monthly", () => {
    expect(periodStart("monthly", d(2026, 6, 15))).toBe(d(2026, 6, 1));
  });
  it("quarterly", () => {
    expect(periodStart("quarterly", d(2026, 7, 20))).toBe(d(2026, 6, 1)); // Aug → Q3 starts Jul 1
  });
  it("semiannual", () => {
    expect(periodStart("semiannual", d(2026, 5, 30))).toBe(d(2026, 0, 1)); // Jun → H1
    expect(periodStart("semiannual", d(2026, 6, 1))).toBe(d(2026, 6, 1)); // Jul → H2
  });
  it("annual", () => {
    expect(periodStart("annual", d(2026, 11, 31))).toBe(d(2026, 0, 1));
  });
  it("is the inclusive lower bound of periodKey", () => {
    const t = d(2026, 6, 1);
    expect(periodKey("semiannual", periodStart("semiannual", t))).toBe(
      periodKey("semiannual", t),
    );
  });
});

describe("postingLagPeriodKey — credits posting just after a boundary", () => {
  it("July 1 credit reimburses H1 (the reported Chase dining case)", () => {
    expect(postingLagPeriodKey("semiannual", d(2026, 6, 1))).toBe("2026-H1");
  });
  it("inside the grace window → previous period", () => {
    expect(postingLagPeriodKey("semiannual", d(2026, 6, 7, 23))).toBe(
      "2026-H1",
    );
    expect(postingLagPeriodKey("monthly", d(2026, 7, 2))).toBe("2026-07");
    expect(postingLagPeriodKey("quarterly", d(2026, 9, 3))).toBe("2026-Q3");
  });
  it("at/after the grace boundary → null", () => {
    expect(
      postingLagPeriodKey("semiannual", d(2026, 6, 1) + POSTING_LAG_GRACE_MS),
    ).toBeNull();
    expect(postingLagPeriodKey("semiannual", d(2026, 6, 20))).toBeNull();
  });
  it("mid-period → null", () => {
    expect(postingLagPeriodKey("semiannual", d(2026, 2, 15))).toBeNull();
    expect(postingLagPeriodKey("monthly", d(2026, 6, 15))).toBeNull();
  });
  it("never crosses a calendar-year boundary", () => {
    expect(postingLagPeriodKey("semiannual", d(2026, 0, 3))).toBeNull();
    expect(postingLagPeriodKey("monthly", d(2026, 0, 2))).toBeNull();
    expect(postingLagPeriodKey("quarterly", d(2026, 0, 5))).toBeNull();
  });
  it("annual is always null (previous period is last year)", () => {
    expect(postingLagPeriodKey("annual", d(2026, 0, 2))).toBeNull();
    expect(postingLagPeriodKey("annual", d(2026, 6, 1))).toBeNull();
  });
});
