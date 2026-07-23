import { describe, expect, it } from "vitest";
import { planBatch, isRetryableStatus, retryDelayMs } from "./freshnessPlan";

describe("planBatch", () => {
  it("claims the full per-run cap while budget remains", () => {
    expect(planBatch(0, 150, 25)).toBe(25);
    expect(planBatch(100, 150, 25)).toBe(25);
  });

  it("shrinks the final batch to the remaining budget", () => {
    expect(planBatch(140, 150, 25)).toBe(10);
  });

  it("stops at the daily cap", () => {
    expect(planBatch(150, 150, 25)).toBe(0);
    expect(planBatch(160, 150, 25)).toBe(0);
  });

  it("handles an exact multiple", () => {
    expect(planBatch(125, 150, 25)).toBe(25);
  });
});

describe("isRetryableStatus", () => {
  it("retries rate limits and server errors", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("fails fast on other client errors", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("backs off exponentially", () => {
    expect(retryDelayMs(0)).toBe(2000);
    expect(retryDelayMs(1)).toBe(4000);
    expect(retryDelayMs(2)).toBe(8000);
  });
});
