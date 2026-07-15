// Pure (no Convex imports) — unit-testable, like plaidCardMap.
// Turns raw Plaid accounts into the review-screen payload: credit accounts
// only, each with the catalog cardKey resolveCardKey could infer (or null
// when only the user can say which card it is — e.g. Chase reports every UR
// card as "Ultimate Rewards®").
import { resolveCardKey } from "./plaidCardMap";

export type RawPlaidAccount = {
  accountId: string;
  mask?: string;
  name?: string;
  officialName?: string;
  subtype?: string;
};

export type DetectedAccount = RawPlaidAccount & {
  resolvedCardKey: string | null;
};

const isCreditAccount = (subtype: string | undefined) =>
  !subtype || /credit/i.test(subtype);

export function deriveDetected(
  accounts: RawPlaidAccount[],
  institutionName: string | undefined,
): DetectedAccount[] {
  return accounts.filter((a) => isCreditAccount(a.subtype)).map((a) => ({
    ...a,
    resolvedCardKey: resolveCardKey(institutionName, a.name, a.officialName),
  }));
}
