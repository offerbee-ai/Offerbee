import { describe, expect, it } from "vitest";
import { capturedThisYear, periodKeysForYear } from "./benefitCycles";

// 2026-07-15 — matches the app's "today" for these fixtures. Current periods:
// monthly 2026-07, quarterly 2026-Q3, semiannual 2026-H2, annual 2026.
const JUL = Date.UTC(2026, 6, 15);

describe("periodKeysForYear", () => {
  it("enumerates all 12 months for monthly", () => {
    expect(periodKeysForYear("monthly", JUL)).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
      "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
    ]);
  });
  it("enumerates the four quarters / two halves / one year", () => {
    expect(periodKeysForYear("quarterly", JUL)).toEqual(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]);
    expect(periodKeysForYear("semiannual", JUL)).toEqual(["2026-H1", "2026-H2"]);
    expect(periodKeysForYear("annual", JUL)).toEqual(["2026"]);
  });
  it("keys always contain the current periodKey", () => {
    for (const cycle of ["monthly", "quarterly", "semiannual", "annual"] as const) {
      expect(periodKeysForYear(cycle, JUL)).toContain(
        // mirror periodKey's output for JUL
        { monthly: "2026-07", quarterly: "2026-Q3", semiannual: "2026-H2", annual: "2026" }[cycle],
      );
    }
  });
});

describe("capturedThisYear", () => {
  it("counts elapsed-period usage, not just the current period (the wallet bug)", () => {
    // Resy: $50/half-year, used $50 in H1 (elapsed), nothing in current H2.
    const sums = new Map([["2026-H1", 50]]);
    expect(capturedThisYear("semiannual", JUL, 50, /* current H2 */ 0, sums)).toBe(50);
  });

  it("sums a monthly credit across every used month of the year", () => {
    // $10/mo dining, used Jan–Jun (elapsed) but not July yet.
    const sums = new Map([
      ["2026-01", 10], ["2026-02", 10], ["2026-03", 10],
      ["2026-04", 10], ["2026-05", 10], ["2026-06", 10],
    ]);
    expect(capturedThisYear("monthly", JUL, 10, 0, sums)).toBe(60);
  });

  it("caps each period at the per-period amount (over-logging never inflates)", () => {
    const sums = new Map([["2026-05", 15]]); // logged $15 against a $10 credit
    expect(capturedThisYear("monthly", JUL, 10, 0, sums)).toBe(10);
  });

  it("uses the authoritative currentUsedAmount for the current period", () => {
    // sums map disagrees with the authoritative current value; current wins.
    const sums = new Map([["2026-07", 3]]);
    expect(capturedThisYear("monthly", JUL, 10, /* authoritative */ 7, sums)).toBe(7);
  });

  it("never exceeds annual value (percentage stays <= 100%)", () => {
    const sums = new Map(
      periodKeysForYear("monthly", JUL).map((k) => [k, 999] as [string, number]),
    );
    // 12 months x $10 cap = $120 = amount * PERIODS_PER_YEAR.
    expect(capturedThisYear("monthly", JUL, 10, 10, sums)).toBe(120);
  });

  it("ignores stale keys from a pre-cycle-change usage history", () => {
    // Benefit was monthly (2026-03 usage) then switched to semiannual; the old
    // monthly key isn't part of the semiannual year and must not count.
    const sums = new Map([["2026-03", 10], ["2026-H1", 50]]);
    expect(capturedThisYear("semiannual", JUL, 50, 0, sums)).toBe(50);
  });

  it("is zero when nothing has been used", () => {
    expect(capturedThisYear("monthly", JUL, 10, 0, new Map())).toBe(0);
  });
});
