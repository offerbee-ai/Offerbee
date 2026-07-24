// Pure reminder-decision math (no Convex imports — unit-testable). Mirrors the
// calendar-period model in benefitCycles.ts. The Convex producer in reminders.ts
// supplies the current-period usage sum; everything else is computed here.

import type { BenefitCycle } from "./validators";
import { periodEnd, periodKey } from "./benefitCycles";

export const DAY_MS = 24 * 60 * 60 * 1000;

// Lead windows (days before reset) per cycle. `headsUp` = the ~2-week (annual:
// ~1-month) advance notice; `lastChance` = the final urgent nudge. Monthly now
// gets a 14-day heads-up so month-end clustering no longer means weeks of
// silence then an N-push burst. Annual/quarterly keep their prior runway
// (these values match the old EXPIRY_BUCKETS for those cycles).
export const EXPIRY_ROUNDUP_LEADS: Record<BenefitCycle, { headsUp: number; lastChance: number }> = {
  monthly: { headsUp: 14, lastChance: 3 },
  quarterly: { headsUp: 14, lastChance: 3 },
  semiannual: { headsUp: 14, lastChance: 3 },
  annual: { headsUp: 30, lastChance: 7 },
};

const roundCents = (n: number) => Math.round(n * 100) / 100;

export type ExpiryTier = "headsUp" | "lastChance";

// Producer-supplied input: one active benefit + its current-period usage/usability.
export type RoundupBenefit = {
  benefitId: string;
  cardKey: string;
  title: string;
  cycle: BenefitCycle;
  amount: number; // dollars per period
  usedAmount: number; // dollars used this period (manual + Plaid auto)
  usable: boolean; // realistically usable (grace-period gate; see reminders.isUsable)
};

// One benefit's computed standing once it has been placed in a tier.
export type RoundupMember = {
  benefitId: string;
  cardKey: string;
  title: string;
  cycle: BenefitCycle;
  remaining: number;
  daysLeft: number;
  periodKey: string;
};

export type RoundupTier = {
  members: RoundupMember[];
  count: number;
  totalRemaining: number;
  soonestDays: number;
  monthAnchor: string; // YYYY-MM of the current calendar month (dedup anchor, from `now`)
};

export type ExpiryRoundupPlan = {
  headsUp: RoundupTier | null;
  lastChance: RoundupTier | null;
};

// lastChance takes precedence when a benefit is inside both windows, so the two
// tiers are mutually exclusive.
function tierFor(cycle: BenefitCycle, daysLeft: number): ExpiryTier | null {
  // Defensive guard for future callers: periodEnd is always > now via the
  // current call path (expiryRoundupPlan derives daysLeft from periodEnd
  // itself), so this branch is unreachable today.
  if (daysLeft < 0) return null;
  const lead = EXPIRY_ROUNDUP_LEADS[cycle];
  if (daysLeft <= lead.lastChance) return "lastChance";
  if (daysLeft <= lead.headsUp) return "headsUp";
  return null;
}

function monthAnchorOf(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Group all expiring, usable, still-unused benefits into two tiers. Pure — the
// Convex producer supplies usedAmount + usable.
export function expiryRoundupPlan(benefits: RoundupBenefit[], now: number): ExpiryRoundupPlan {
  const byTier: Record<ExpiryTier, RoundupMember[]> = { headsUp: [], lastChance: [] };
  for (const b of benefits) {
    const remaining = roundCents(b.amount - b.usedAmount);
    if (remaining <= 0) continue;
    if (!b.usable) continue;
    const daysLeft = Math.ceil((periodEnd(b.cycle, now) - now) / DAY_MS);
    const tier = tierFor(b.cycle, daysLeft);
    if (!tier) continue;
    byTier[tier].push({
      benefitId: b.benefitId,
      cardKey: b.cardKey,
      title: b.title,
      cycle: b.cycle,
      remaining,
      daysLeft,
      periodKey: periodKey(b.cycle, now),
    });
  }
  const build = (members: RoundupMember[]): RoundupTier | null => {
    if (members.length === 0) return null;
    const totalRemaining = roundCents(members.reduce((a, m) => a + m.remaining, 0));
    const soonest = members.reduce((a, m) => (m.daysLeft < a.daysLeft ? m : a));
    return {
      members,
      count: members.length,
      totalRemaining,
      soonestDays: soonest.daysLeft,
      // Anchored on `now` (the current calendar month), not the reset instant:
      // this is a stable per-calendar-month dedup key for the batched
      // notification, independent of which cycle(s) contributed members.
      monthAnchor: monthAnchorOf(now),
    };
  };
  return { headsUp: build(byTier.headsUp), lastChance: build(byTier.lastChance) };
}
