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
