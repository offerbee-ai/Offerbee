import { describe, expect, it } from "vitest";
import { inQuietHours } from "./pushQuietHours";

const at = (utcHour: number) => Date.UTC(2026, 6, 15, utcHour, 0, 0);

describe("inQuietHours", () => {
  it("is false when start === end or unset", () => {
    expect(inQuietHours({ quietHoursStart: 22, quietHoursEnd: 22, timeZone: "UTC" }, at(23))).toBe(false);
    expect(inQuietHours({ timeZone: "UTC" }, at(3))).toBe(false);
  });
  it("handles an overnight window (22 -> 7) in UTC", () => {
    expect(inQuietHours({ quietHoursStart: 22, quietHoursEnd: 7, timeZone: "UTC" }, at(23))).toBe(true);
    expect(inQuietHours({ quietHoursStart: 22, quietHoursEnd: 7, timeZone: "UTC" }, at(3))).toBe(true);
    expect(inQuietHours({ quietHoursStart: 22, quietHoursEnd: 7, timeZone: "UTC" }, at(12))).toBe(false);
  });
  it("handles a same-day window (1 -> 6)", () => {
    expect(inQuietHours({ quietHoursStart: 1, quietHoursEnd: 6, timeZone: "UTC" }, at(3))).toBe(true);
    expect(inQuietHours({ quietHoursStart: 1, quietHoursEnd: 6, timeZone: "UTC" }, at(8))).toBe(false);
  });
  it("resolves the hour in the user's timezone", () => {
    // 06:00 UTC == 02:00 America/New_York (EDT, July) -> inside 0..6
    expect(inQuietHours({ quietHoursStart: 0, quietHoursEnd: 6, timeZone: "America/New_York" }, at(6))).toBe(true);
  });
  it("does not suppress on an unknown timezone", () => {
    expect(inQuietHours({ quietHoursStart: 0, quietHoursEnd: 23, timeZone: "Not/AZone" }, at(3))).toBe(false);
  });
});
