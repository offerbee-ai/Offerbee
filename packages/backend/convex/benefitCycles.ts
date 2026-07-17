// Pure calendar-period math for tracked credits. UTC v1 — see the timezone note
// below. No Convex imports so this is trivially unit-testable and shared by
// every query/mutation (and reusable by native through the generated api).

import type { BenefitCycle } from "./validators";

export const PERIODS_PER_YEAR: Record<BenefitCycle, number> = {
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
};

function parts(now: number) {
  const d = new Date(now);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; // m: 0-11
}

// Stable calendar-period key containing `now`. Lexicographic order within a
// single cycle equals chronological order (formats never mix inside one benefit).
export function periodKey(cycle: BenefitCycle, now: number): string {
  const { y, m } = parts(now);
  switch (cycle) {
    case "monthly":
      return `${y}-${String(m + 1).padStart(2, "0")}`; // 2026-07
    case "quarterly":
      return `${y}-Q${Math.floor(m / 3) + 1}`; // 2026-Q3
    case "semiannual":
      return `${y}-H${m < 6 ? 1 : 2}`; // 2026-H2
    case "annual":
      return `${y}`; // 2026
  }
}

// Exclusive end of the current period = the reset instant, ms UTC.
export function periodEnd(cycle: BenefitCycle, now: number): number {
  const { y, m } = parts(now);
  switch (cycle) {
    case "monthly":
      return Date.UTC(y, m + 1, 1);
    case "quarterly":
      return Date.UTC(y, (Math.floor(m / 3) + 1) * 3, 1);
    case "semiannual":
      return Date.UTC(y, m < 6 ? 6 : 12, 1);
    case "annual":
      return Date.UTC(y + 1, 0, 1);
  }
}

// Inclusive start of the period containing `now`, ms UTC.
export function periodStart(cycle: BenefitCycle, now: number): number {
  const { y, m } = parts(now);
  switch (cycle) {
    case "monthly":
      return Date.UTC(y, m, 1);
    case "quarterly":
      return Date.UTC(y, Math.floor(m / 3) * 3, 1);
    case "semiannual":
      return Date.UTC(y, m < 6 ? 0 : 6, 1);
    case "annual":
      return Date.UTC(y, 0, 1);
  }
}

// Issuers post statement credits a few days after the qualifying purchase
// (Chase posts "DINING CREDIT $300/YEAR" reimbursements 1–3 business days
// later), so a credit posting inside this window after a period boundary
// usually reimburses usage from the PREVIOUS period.
export const POSTING_LAG_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

// The previous period's key when `now` falls within the posting-lag grace
// window after a period start — the calendar half of lag attribution; whether
// the previous period can still absorb the amount is the caller's check.
// Returns null outside the window, and never crosses a calendar-year boundary
// (the tracker only shows the current year, so a Jan 3 credit stays in the new
// year rather than vanishing into last year's grid). Annual benefits therefore
// always return null.
export function postingLagPeriodKey(
  cycle: BenefitCycle,
  now: number,
): string | null {
  const start = periodStart(cycle, now);
  if (now - start >= POSTING_LAG_GRACE_MS) return null;
  const prev = start - 1; // last instant of the previous period
  if (new Date(prev).getUTCFullYear() !== new Date(now).getUTCFullYear())
    return null;
  return periodKey(cycle, prev);
}

// The N periods of `cycle` for the calendar year containing `now`, in
// chronological order, each tagged relative to the current period. Drives the
// per-period grid UI (annual → 1 cell = a checkbox; quarterly → 4; semiannual
// → 2). Returns [] for monthly (12 cells is intentionally not gridded).
// Keys match `periodKey` exactly so callers can join usage sums by key.
export type PeriodStatus = "elapsed" | "current" | "upcoming";

export function periodsForYear(
  cycle: BenefitCycle,
  now: number,
): { key: string; label: string; status: PeriodStatus }[] {
  const { y } = parts(now);
  const defs: { key: string; label: string }[] =
    cycle === "quarterly"
      ? [1, 2, 3, 4].map((q) => ({ key: `${y}-Q${q}`, label: `Q${q}` }))
      : cycle === "semiannual"
        ? [
            { key: `${y}-H1`, label: "Jan–Jun" },
            { key: `${y}-H2`, label: "Jul–Dec" },
          ]
        : cycle === "annual"
          ? [{ key: `${y}`, label: `${y}` }]
          : []; // monthly: no grid

  const currentKey = periodKey(cycle, now);
  const currentIdx = defs.findIndex((d) => d.key === currentKey);
  return defs.map((d, i) => ({
    key: d.key,
    label: d.label,
    status: i < currentIdx ? "elapsed" : i === currentIdx ? "current" : "upcoming",
  }));
}

// v2 timezone upgrade path: `users.timeZone` (optional, IANA) is unset for most
// rows today, so v1 uses UTC. The only distortion is within hours of a period
// boundary; day-granular countdowns are unaffected. To upgrade, resolve the
// user's local Y/M via Intl.DateTimeFormat before computing key/end — the
// periodKey string formats above do not change, so it's a drop-in.
