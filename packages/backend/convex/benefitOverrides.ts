// Curated corrections for benefits whose CATALOG TEXT is wrong or incomplete —
// the issuer's real terms differ from what the Rewards API prose says, so the
// parser (which can only read the text) needs a factual override. Keyed by
// (cardKey, benefitTitle) exactly as suggestCredits produces them.
//
// CONSISTENCY: this map is applied inside suggestCredits, which is the single
// parse path used by seeding (seedForUserCard), the suggestions UI
// (suggestionsForCard), and the reconcile repair (repairSeededAmounts) — so
// every consumer sees identical values, and the repair converges existing
// untouched rows to the same numbers after a deploy. Pure module (no Convex
// imports) so it's unit-testable.
//
// Only add entries verified against the issuer's own benefit terms.

import type { BenefitCycle } from "./validators";
import type { ParsedCredit } from "./benefitParser";

type Override = { amount?: number; cycle?: BenefitCycle };

const BENEFIT_OVERRIDES: Record<string, Record<string, Override>> = {
  "chase-sapphirereserve": {
    // Catalog says "up to $300 in annual statement credits" with no mention of
    // the split; Chase's terms grant $150 Jan–Jun + $150 Jul–Dec.
    StubHub: { amount: 150, cycle: "semiannual" },
  },
};

// Apply any curated override for (cardKey, benefitTitle). Returns the parsed
// credit unchanged when there's none.
export function applyBenefitOverride(
  cardKey: string | undefined,
  parsed: ParsedCredit,
): ParsedCredit {
  if (!cardKey) return parsed;
  const o = BENEFIT_OVERRIDES[cardKey]?.[parsed.benefitTitle];
  if (!o) return parsed;
  return {
    ...parsed,
    amount: o.amount ?? parsed.amount,
    cycle: o.cycle ?? parsed.cycle,
    confidence: "high", // curated facts beat text heuristics
  };
}
