// Heuristic parser turning a card's prose benefit ({benefitTitle, benefitDesc})
// into a suggested trackable credit (amount + cycle). DISPLAY-TIME ONLY — parsed
// terms are never persisted; only user-confirmed values are stored in
// userBenefits. Pure module (no Convex imports) so it's unit-testable and shared.
//
// Worked example: "$300 lululemon Credit" + "up to $75 in statement credits each
// quarter" -> quarterly, $75 (the per-period chunk, not the $300 annual total),
// confidence high ($300 === $75 x 4).

import { PERIODS_PER_YEAR } from "./benefitCycles";
import type { BenefitCycle } from "./validators";

export interface ParsedCredit {
  benefitTitle: string; // original API title (provenance + dedup)
  title: string; // display name (= benefitTitle, already recognizable)
  amount: number; // dollars per period
  cycle: BenefitCycle;
  confidence: "high" | "medium";
}

interface Benefit {
  benefitTitle: string;
  benefitDesc?: string;
}

// Non-credit benefits (protections/perks/one-offs) we never suggest.
const TITLE_EXCLUDE =
  /\b(insurance|protection|coverage|assistance|concierge|warranty|status|lounge|access|entry|precheck|global\s+entry)\b/i;
// Per-event valuations dressed up with a $ amount, not recurring credits.
const DESC_EXCLUDE =
  /\bper\s+(claim|incident|item|trip|stay|covered\s+traveler|night)\b|\bvalued\s+at\b|\baverage\s+total\s+value\b/i;
// Multi-year cadence doesn't fit the cycle enum — skip (still manually addable).
const MULTIYEAR = /\bevery\s+(?:4(?:\.5)?|four|five)\s+years?\b/i;

// Checked in precedence order: a monthly phrase wins over an annual one so the
// per-month chunk overrides a title's annual total.
const CYCLE_PATTERNS: Array<[BenefitCycle, RegExp]> = [
  ["monthly", /\b(?:each|every|per|a)\s+month\b|\bmonthly\b/i],
  [
    "quarterly",
    /\b(?:each|every|per)\s+quarter\b|\bquarterly\b|\bevery\s+three\s+months\b/i,
  ],
  [
    "semiannual",
    /semi-?annual(?:ly)?|\btwice\s+(?:a|per)\s+year\b|january\s+through\s+june|july\s+through\s+december/i,
  ],
  [
    "annual",
    /\b(?:per|each|every)\s+(?:calendar\s+|anniversary\s+)?year\b|\bannual(?:ly)?\b|\baccount\s+anniversary\b/i,
  ],
];

function toAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

// Blank out spend-REQUIREMENT dollars ("after you spend $75,000") so they're
// never mistaken for the credit amount. Replaced with equal-length spaces to
// keep every other match's index stable.
function maskSpendRequirements(text: string): string {
  return text.replace(
    /\bspend(?:ing)?\s+\$\s?[\d,]+(?:\.\d{2})?/gi,
    (m) => " ".repeat(m.length),
  );
}

// All $amounts in text with their positions (end = index just past the match).
function dollarsWithIndex(
  text: string,
): Array<{ amount: number; index: number; end: number }> {
  const out: Array<{ amount: number; index: number; end: number }> = [];
  const re = /\$\s?([\d,]+(?:\.\d{2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const amt = toAmount(m[1]);
    if (Number.isFinite(amt) && amt > 0)
      out.push({ amount: amt, index: m.index, end: m.index + m[0].length });
  }
  return out;
}

// "$300 annually", "$300 per year", "$300/yr" — the figure is the YEAR TOTAL,
// not the per-period amount ("Up to $300 annually in monthly DoorDash promos.
// Get up to $25 each month…" must parse as $25/monthly, never $300/monthly).
const ANNUAL_TOTAL_AFTER =
  /^\s?(?:annually|(?:per|each|a)\s+(?:calendar\s+)?year|\/\s?(?:yr|year))\b/i;
const annualMarked = (text: string, d: { end: number }): boolean =>
  ANNUAL_TOTAL_AFTER.test(text.slice(d.end));

function firstDollar(text: string): number | undefined {
  return dollarsWithIndex(text)[0]?.amount;
}

// Locate cycle: scan desc first (per-period language lives there), then title;
// within each, most-specific cadence wins.
function detectCycle(
  desc: string,
  title: string,
): { cycle: BenefitCycle; text: string; index: number } | null {
  for (const text of [desc, title]) {
    if (!text) continue;
    for (const [cycle, re] of CYCLE_PATTERNS) {
      const m = re.exec(text);
      if (m) return { cycle, text, index: m.index };
    }
  }
  return null;
}

export function parseBenefitCredit(b: Benefit): ParsedCredit | null {
  const title = (b.benefitTitle ?? "").trim();
  const desc = (b.benefitDesc ?? "").trim();
  const both = `${title} ${desc}`;

  if (!/\$\s?\d/.test(both)) return null; // 1. no dollar figure at all
  if (TITLE_EXCLUDE.test(title)) return null; // 2. non-credit perk
  if (DESC_EXCLUDE.test(desc)) return null; // 3. per-event valuation
  if (MULTIYEAR.test(both)) return null; // 4. multi-year cadence

  const detected = detectCycle(desc, title); // 5. cycle (null => not a credit)
  if (!detected) return null;
  const { cycle, text, index } = detected;

  // 6. amount closest to the cycle phrase (same-sentence-ish window), else
  //    first $ in title, else first $ in desc. Spend requirements are masked so
  //    "$250 credit after you spend $75,000/year" never yields $75,000.
  //    For sub-annual cycles, a figure written as a year total ("$300 annually")
  //    is skipped in favor of the per-period figure — or divided by the number
  //    of periods when it's the only figure around.
  let amount: number | undefined;
  const masked = maskSpendRequirements(text);
  const near = dollarsWithIndex(masked)
    .map((d) => ({ ...d, dist: Math.abs(d.index - index) }))
    .filter((d) => d.dist <= 120)
    .sort((a, b2) => a.dist - b2.dist);
  if (cycle !== "annual") {
    const perPeriod = near.find((d) => !annualMarked(masked, d));
    const yearTotal = near.find((d) => annualMarked(masked, d));
    amount =
      perPeriod?.amount ??
      (yearTotal
        ? Math.round((yearTotal.amount / PERIODS_PER_YEAR[cycle]) * 100) / 100
        : undefined);
  } else {
    amount = near[0]?.amount;
  }
  amount ??= firstDollar(title) ?? firstDollar(maskSpendRequirements(desc));
  if (amount === undefined || amount <= 0) return null;

  // 7. confidence
  const titleAmount = firstDollar(title);
  const confidence =
    titleAmount === undefined ||
    titleAmount === amount ||
    titleAmount === amount * PERIODS_PER_YEAR[cycle]
      ? "high"
      : "medium";

  return { benefitTitle: title, title, amount, cycle, confidence };
}

export function suggestCredits(benefits: Benefit[]): ParsedCredit[] {
  return benefits
    .map((b) => parseBenefitCredit(b))
    .filter((p): p is ParsedCredit => p !== null);
}
