// Resolve a Plaid credit-card account to an OfferBee catalog cardKey, so a fresh
// Plaid connection can auto-add the card (seeding its credits) and auto-link the
// account — no manual mapping. Curated keyword map over the account name/official
// name (+ issuer for ambiguous product words). Returns null when unsure; the
// user can still link manually. Keys match catalog.POPULAR_CARDS.
// Pure (no Convex imports) — unit-testable.

type CardRule = { key: string; test: RegExp; issuer?: RegExp };

// Order matters: most specific product names first (e.g. "Venture X" before
// "Venture", "Premium Rewards Elite" before "Premium Rewards").
const CARD_RULES: CardRule[] = [
  // American Express — generic words (gold/green/platinum) gated by issuer.
  { key: "amex-bluecashpreferred", test: /blue cash preferred/i },
  { key: "amex-bluecasheveryday", test: /blue cash everyday/i },
  { key: "amex-platinum", test: /platinum/i, issuer: /amex|american express/i },
  { key: "amex-gold", test: /\bgold\b/i, issuer: /amex|american express/i },
  { key: "amex-green", test: /\bgreen\b/i, issuer: /amex|american express/i },
  // Chase
  { key: "chase-sapphirereserve", test: /sapphire reserve/i },
  { key: "chase-sapphirepreferred", test: /sapphire preferred/i },
  { key: "chase-freedomunlimited", test: /freedom unlimited/i },
  { key: "chase-freedomflex", test: /freedom flex/i },
  // Capital One
  { key: "capitalone-venturex", test: /venture x/i },
  { key: "capitalone-venture", test: /\bventure\b/i },
  { key: "capitalone-savor", test: /savor/i },
  { key: "capitalone-quicksilver", test: /quicksilver/i },
  // Citi
  { key: "citi-strataelite", test: /strata elite/i },
  { key: "citi-premier", test: /premier/i },
  { key: "citi-doublecash", test: /double cash/i },
  { key: "citi-customcash", test: /custom cash/i },
  // Bank of America
  { key: "boa-premiumrewardselite", test: /premium rewards elite/i },
  { key: "boa-premiumrewards", test: /premium rewards/i },
  { key: "boa-customizedcashrewards", test: /customized cash/i },
  { key: "boa-travelrewards", test: /travel rewards/i },
  // Wells Fargo
  { key: "wellsfargo-activecash", test: /active cash/i },
  { key: "wellsfargo-autographjourney", test: /autograph journey/i },
  { key: "wellsfargo-autograph", test: /autograph/i },
  { key: "wellsfargo-bilt", test: /bilt/i },
];

export function resolveCardKey(
  institutionName: string | undefined,
  accountName: string | undefined,
  officialName: string | undefined,
): string | null {
  const hay = `${accountName ?? ""} ${officialName ?? ""}`;
  const inst = `${institutionName ?? ""} ${hay}`;
  for (const r of CARD_RULES) {
    if (r.issuer && !r.issuer.test(inst)) continue;
    if (r.test.test(hay)) return r.key;
  }
  return null;
}
