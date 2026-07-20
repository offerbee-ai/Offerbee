// Curated corrections for benefits whose CATALOG TEXT is wrong or incomplete —
// the issuer's real terms differ from what the Rewards API prose says, so the
// parser (which can only read the text) needs a factual override. Keyed by
// (cardKey, benefitTitle) exactly as suggestCredits produces them.
//
// The corrections themselves are CONFIG, not code: benefitOverrides.json,
// shape `{ [cardKey]: { [benefitTitle]: { amount?, cycle?, note? } } }` where
// `note` documents why the override exists (issuer-terms provenance) and is
// ignored by logic. Only add entries verified against the issuer's own terms.
// The config is validated at module load — a malformed entry fails deploy and
// tests immediately instead of silently misbehaving.
//
// CONSISTENCY: this map is applied inside suggestCredits, which is the single
// parse path used by seeding (seedForUserCard), the suggestions UI
// (suggestionsForCard), and the reconcile repair (repairSeededAmounts) — so
// every consumer sees identical values, and the repair converges existing
// untouched rows to the same numbers after a deploy. Pure module (no Convex
// imports) so it's unit-testable.

import type { BenefitCycle } from "./validators";
import type { ParsedCredit } from "./benefitParser";
import rawOverrides from "./benefitOverrides.json";

type Override = { amount?: number; cycle?: BenefitCycle };

const CYCLES = ["monthly", "quarterly", "semiannual", "annual"] as const;

// Validate the JSON config's shape; throws `cardKey/title: problem` so a bad
// edit is caught at deploy/test time. Exported for direct testing.
export function validateOverrides(
  raw: unknown,
): Record<string, Record<string, Override>> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new Error("benefitOverrides.json: root must be an object");
  const out: Record<string, Record<string, Override>> = {};
  for (const [cardKey, byTitle] of Object.entries(raw)) {
    if (!cardKey.trim())
      throw new Error("benefitOverrides.json: empty cardKey");
    if (typeof byTitle !== "object" || byTitle === null || Array.isArray(byTitle))
      throw new Error(`benefitOverrides.json: ${cardKey}: must be an object`);
    out[cardKey] = {};
    for (const [title, o] of Object.entries(byTitle as Record<string, any>)) {
      const at = `benefitOverrides.json: ${cardKey}/${title}`;
      if (!title.trim()) throw new Error(`${at}: empty benefit title`);
      if (typeof o !== "object" || o === null)
        throw new Error(`${at}: override must be an object`);
      const { amount, cycle } = o;
      if (amount === undefined && cycle === undefined)
        throw new Error(`${at}: must set amount and/or cycle`);
      if (
        amount !== undefined &&
        (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)
      )
        throw new Error(`${at}: amount must be a positive number`);
      if (cycle !== undefined && !CYCLES.includes(cycle))
        throw new Error(
          `${at}: cycle must be one of ${CYCLES.join("/")} (got "${cycle}")`,
        );
      out[cardKey][title] = {
        ...(amount !== undefined ? { amount } : {}),
        ...(cycle !== undefined ? { cycle: cycle as BenefitCycle } : {}),
      };
    }
  }
  return out;
}

const BENEFIT_OVERRIDES = validateOverrides(rawOverrides);

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
