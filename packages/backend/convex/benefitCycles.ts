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

// v2 timezone upgrade path: `users.timeZone` (optional, IANA) is unset for most
// rows today, so v1 uses UTC. The only distortion is within hours of a period
// boundary; day-granular countdowns are unaffected. To upgrade, resolve the
// user's local Y/M via Intl.DateTimeFormat before computing key/end — the
// periodKey string formats above do not change, so it's a drop-in.
