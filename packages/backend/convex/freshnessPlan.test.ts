import { describe, expect, it } from "vitest";
import {
  planBatch,
  isRetryableStatus,
  retryDelayMs,
  selectDueCandidates,
  type FreshnessCandidate,
} from "./freshnessPlan";

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

describe("selectDueCandidates", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const WEEK = 7 * DAY;
  const NOW = 1_000_000_000_000;
  const cutoff = NOW - WEEK;

  const card = (
    cardKey: string,
    lastVerifiedAt: number | null,
  ): FreshnessCandidate => ({
    cardKey,
    cardName: cardKey,
    cardIssuer: "issuer",
    cardUrl: null,
    lastVerifiedAt,
  });

  it("drops cards verified within the TTL window (fresh)", () => {
    const out = selectDueCandidates(
      [card("fresh", NOW - 1 * DAY), card("due", NOW - 8 * DAY)],
      NOW,
      WEEK,
      15,
    );
    expect(out.map((c) => c.cardKey)).toEqual(["due"]);
  });

  it("keeps never-verified cards and ranks them oldest-first", () => {
    const out = selectDueCandidates(
      [card("due", NOW - 8 * DAY), card("never", null)],
      NOW,
      WEEK,
      15,
    );
    expect(out.map((c) => c.cardKey)).toEqual(["never", "due"]);
  });

  it("treats a card exactly at the cutoff as still fresh (strict <, matches cron)", () => {
    const out = selectDueCandidates([card("edge", cutoff)], NOW, WEEK, 15);
    expect(out).toHaveLength(0);
  });

  it("sorts due cards oldest-first", () => {
    const out = selectDueCandidates(
      [
        card("recent-due", NOW - 8 * DAY),
        card("older-due", NOW - 30 * DAY),
        card("oldest-due", NOW - 90 * DAY),
      ],
      NOW,
      WEEK,
      15,
    );
    expect(out.map((c) => c.cardKey)).toEqual([
      "oldest-due",
      "older-due",
      "recent-due",
    ]);
  });

  it("caps the result at the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      card(`c${i}`, NOW - (8 + i) * DAY),
    );
    expect(selectDueCandidates(many, NOW, WEEK, 15)).toHaveLength(15);
  });

  it("returns empty when every card is fresh", () => {
    const out = selectDueCandidates(
      [card("a", NOW - 1 * DAY), card("b", NOW - 6 * DAY)],
      NOW,
      WEEK,
      15,
    );
    expect(out).toHaveLength(0);
  });
});
