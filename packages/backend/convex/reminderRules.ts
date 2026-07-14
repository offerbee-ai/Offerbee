// Pure reminder-decision math (no Convex imports — unit-testable). Mirrors the
// calendar-period model in benefitCycles.ts. The Convex producer in reminders.ts
// supplies the current-period usage sum; everything else is computed here.

import type { BenefitCycle } from "./validators";
import { periodEnd, periodKey } from "./benefitCycles";

export const DAY_MS = 24 * 60 * 60 * 1000;

// Day-count windows before a credit resets, per cycle. ASCENDING — pickBucket
// returns the smallest bucket >= daysLeft (the tightest window daysLeft has
// entered), and each distinct bucket fires exactly once (dedup is per bucket).
export const EXPIRY_BUCKETS: Record<BenefitCycle, number[]> = {
  monthly: [3],
  quarterly: [3, 14],
  semiannual: [3, 14],
  annual: [7, 30],
};

export function pickBucket(daysLeft: number, bucketsAsc: number[]): number | null {
  if (daysLeft < 0) return null;
  for (const m of bucketsAsc) if (daysLeft <= m) return m;
  return null;
}

const roundCents = (n: number) => Math.round(n * 100) / 100;

export type ExpiryInput = {
  benefitId: string;
  cycle: BenefitCycle;
  amount: number; // dollars per period
  usedAmount: number; // dollars used this period (manual + Plaid auto)
  now: number; // ms
};

export type ExpiryCandidate = {
  dedupKey: string;
  periodKey: string;
  bucket: number;
  daysLeft: number;
  remaining: number;
};

// Decide whether an unused-credit expiry nudge is due this run. null = nothing
// fires (fully used, or outside every bucket window).
export function expiryCandidate(input: ExpiryInput): ExpiryCandidate | null {
  const { benefitId, cycle, amount, usedAmount, now } = input;
  const remaining = roundCents(amount - usedAmount);
  if (remaining <= 0) return null;
  const pk = periodKey(cycle, now);
  const daysLeft = Math.ceil((periodEnd(cycle, now) - now) / DAY_MS);
  const bucket = pickBucket(daysLeft, EXPIRY_BUCKETS[cycle]);
  if (bucket === null) return null;
  return { dedupKey: `credit_expiring:${benefitId}:${pk}:${bucket}`, periodKey: pk, bucket, daysLeft, remaining };
}
