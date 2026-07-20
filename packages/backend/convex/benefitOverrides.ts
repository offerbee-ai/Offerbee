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

// Titles are matched trimmed + case-insensitively so upstream casing drift
// ("StubHub" → "Stubhub") can't silently disable a correction. Bigger renames
// ("StubHub Credit") still miss — staleOverrideTitles surfaces those.
const norm = (s: string) => s.trim().toLowerCase();

const NORMALIZED: Record<string, Map<string, Override & { title: string }>> =
  Object.fromEntries(
    Object.entries(BENEFIT_OVERRIDES).map(([cardKey, byTitle]) => [
      cardKey,
      new Map(
        Object.entries(byTitle).map(([title, o]) => [norm(title), { ...o, title }]),
      ),
    ]),
  );

// Apply any curated override for (cardKey, benefitTitle). Returns the parsed
// credit unchanged when there's none.
export function applyBenefitOverride(
  cardKey: string | undefined,
  parsed: ParsedCredit,
): ParsedCredit {
  if (!cardKey) return parsed;
  const o = NORMALIZED[cardKey]?.get(norm(parsed.benefitTitle));
  if (!o) return parsed;
  return {
    ...parsed,
    amount: o.amount ?? parsed.amount,
    cycle: o.cycle ?? parsed.cycle,
    confidence: "high", // curated facts beat text heuristics
  };
}

// Drift detection: configured override titles that match NONE of the card's
// currently-parsed benefit titles — i.e. the upstream API renamed the benefit
// and the correction silently stopped applying. Surfaced by
// benefits.repairSeededAmounts so every reconcile run reports it.
export function staleOverrideTitles(
  cardKey: string,
  parsedTitles: string[],
): string[] {
  const configured = NORMALIZED[cardKey];
  if (!configured) return [];
  const present = new Set(parsedTitles.map(norm));
  return [...configured.values()]
    .filter((o) => !present.has(norm(o.title)))
    .map((o) => o.title);
}
