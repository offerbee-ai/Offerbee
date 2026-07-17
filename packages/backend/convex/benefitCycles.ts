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

const roundCents = (n: number) => Math.round(n * 100) / 100;

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

// Every periodKey of `cycle` within the calendar year containing `now`, in
// chronological order — including all 12 months for monthly (unlike
// `periodsForYear`, which returns [] for monthly because the UI never grids 12
// cells). Keys match `periodKey` exactly, so this is the join set for
// year-to-date usage rollups. Restricting to the current cycle's keys means
// stale usage rows from a pre-`updateBenefit` cycle change are naturally
// excluded — same "cycle change restarts clean" semantic as the grid.
export function periodKeysForYear(cycle: BenefitCycle, now: number): string[] {
  const { y } = parts(now);
  switch (cycle) {
    case "monthly":
      return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
    case "quarterly":
      return [1, 2, 3, 4].map((q) => `${y}-Q${q}`);
    case "semiannual":
      return [`${y}-H1`, `${y}-H2`];
    case "annual":
      return [`${y}`];
  }
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// All 12 months of the calendar year containing `now`, tagged relative to the
// current month. Keys match `periodKey("monthly", …)`. Powers the credit-detail
// "This year" strip (the list never grids 12 cells — see `periodsForYear`).
export function monthlyPeriodsForYear(
  now: number,
): { key: string; label: string; status: PeriodStatus }[] {
  const { y, m } = parts(now);
  return Array.from({ length: 12 }, (_, i) => ({
    key: `${y}-${String(i + 1).padStart(2, "0")}`,
    label: MONTH_LABELS[i],
    status: i < m ? "elapsed" : i === m ? "current" : "upcoming",
  }));
}

// Year-to-date captured dollars for one credit: the sum, over every period of
// this calendar year, of that period's usage capped at the per-period `amount`.
// This — not the current period's usage alone — is what an annual-fee ROI must
// compare against (a $10/mo credit used all year captured $120, not $0–$10).
//
// The current period reuses the authoritative `currentUsedAmount` (same value
// the mark-used UI shows) so the aggregate and the per-period grid can never
// disagree; all other periods read from `usageByKey` (see `yearPeriodUsage`).
// Result is <= amount * PERIODS_PER_YEAR[cycle] by construction, so any
// captured/annual-value percentage derived from it stays within 0–100%.
export function capturedThisYear(
  cycle: BenefitCycle,
  now: number,
  amount: number,
  currentUsedAmount: number,
  usageByKey: Map<string, number>,
): number {
  const currentKey = periodKey(cycle, now);
  let ytd = 0;
  for (const key of periodKeysForYear(cycle, now)) {
    const used = key === currentKey ? currentUsedAmount : (usageByKey.get(key) ?? 0);
    ytd += Math.min(used, amount);
  }
  return roundCents(ytd);
}

// v2 timezone upgrade path: `users.timeZone` (optional, IANA) is unset for most
// rows today, so v1 uses UTC. The only distortion is within hours of a period
// boundary; day-granular countdowns are unaffected. To upgrade, resolve the
// user's local Y/M via Intl.DateTimeFormat before computing key/end — the
// periodKey string formats above do not change, so it's a drop-in.
