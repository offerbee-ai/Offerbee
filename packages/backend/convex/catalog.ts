import { query } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./auth";

// Card search is hybrid: searchCatalogLocal (below) serves instant, reactive
// matches from cards already in the catalog, while rapidapi.searchCards is the
// API-backed completeness backstop (the API has no bulk card-list endpoint).

// Instant, reactive full-text search over the local catalog — no API call. Zero
// cost, and it updates automatically as rapidapi.searchCards upserts newly
// fetched cards. Covers the prefill set + anything previously name-searched;
// obscure cards not yet in the catalog surface once the API backstop backfills.
export const searchCatalogLocal = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const t = term.trim();
    if (t.length < 2) return [];
    const rows = await ctx.db
      .query("cardCatalog")
      .withSearchIndex("search_cardName", (q) => q.search("cardName", t))
      .take(20);
    return rows.map((r) => ({
      cardKey: r.cardKey,
      cardName: r.cardName,
      cardIssuer: r.cardIssuer,
    }));
  },
});

// Cached full detail for a single card (or null if not yet fetched).
export const getCardDetail = query({
  args: { cardKey: v.string() },
  handler: async (ctx, { cardKey }) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .unique();
  },
});

// ── Popular cards (curated) ─────────────────────────────────────────────────
// The API has no popularity ranking, so the Add-card screen browses a curated
// set of top cards per major issuer. cardKeys are verified against the live API
// (detail-bycard / namesearch); display names are concise on purpose. Concise
// display names live here; image + annual fee come from cached cardDetails.
const POPULAR_CARDS: { issuer: string; cards: { cardKey: string; name: string }[] }[] = [
  {
    issuer: "Chase",
    cards: [
      { cardKey: "chase-sapphirepreferred", name: "Sapphire Preferred" },
      { cardKey: "chase-sapphirereserve", name: "Sapphire Reserve" },
      { cardKey: "chase-freedomunlimited", name: "Freedom Unlimited" },
      { cardKey: "chase-freedomflex", name: "Freedom Flex" },
    ],
  },
  {
    issuer: "American Express",
    cards: [
      { cardKey: "amex-gold", name: "Gold Card" },
      { cardKey: "amex-platinum", name: "The Platinum Card" },
      { cardKey: "amex-bluecashpreferred", name: "Blue Cash Preferred" },
      { cardKey: "amex-green", name: "Green Card" },
    ],
  },
  {
    issuer: "Capital One",
    cards: [
      { cardKey: "capitalone-venturex", name: "Venture X" },
      { cardKey: "capitalone-venture", name: "Venture" },
      { cardKey: "capitalone-savor", name: "SavorOne" },
      { cardKey: "capitalone-quicksilver", name: "Quicksilver" },
    ],
  },
  {
    issuer: "Citi",
    cards: [
      { cardKey: "citi-premier", name: "Strata Premier" },
      { cardKey: "citi-doublecash", name: "Double Cash" },
      { cardKey: "citi-customcash", name: "Custom Cash" },
      { cardKey: "citi-strataelite", name: "Strata Elite" },
    ],
  },
  {
    issuer: "Bank of America",
    cards: [
      { cardKey: "boa-premiumrewards", name: "Premium Rewards" },
      { cardKey: "boa-customizedcashrewards", name: "Customized Cash Rewards" },
      { cardKey: "boa-travelrewards", name: "Travel Rewards" },
      { cardKey: "boa-premiumrewardselite", name: "Premium Rewards Elite" },
    ],
  },
  {
    issuer: "Wells Fargo",
    cards: [
      { cardKey: "wellsfargo-activecash", name: "Active Cash" },
      { cardKey: "wellsfargo-autograph", name: "Autograph" },
      { cardKey: "wellsfargo-autographjourney", name: "Autograph Journey" },
      { cardKey: "wellsfargo-bilt", name: "Bilt Mastercard" },
    ],
  },
];

// Flat cardKey list for pre-warming curated details (see rapidapi.warmPopularCards).
export const POPULAR_CARD_KEYS: string[] = POPULAR_CARDS.flatMap((g) =>
  g.cards.map((c) => c.cardKey),
);

// Curated top cards grouped by issuer for the Add-card browse view. Joins cached
// detail for image + annual fee, and flags cards already in the user's wallet.
export const popularCards = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const owned = new Set(
      (
        await ctx.db
          .query("userCards")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .take(200)
      ).map((c) => c.cardKey),
    );

    return await Promise.all(
      POPULAR_CARDS.map(async (group) => ({
        issuer: group.issuer,
        cards: await Promise.all(
          group.cards.map(async (c) => {
            const detail = await ctx.db
              .query("cardDetails")
              .withIndex("by_cardKey", (q) => q.eq("cardKey", c.cardKey))
              .unique();
            return {
              cardKey: c.cardKey,
              cardName: c.name,
              imageUrl: detail?.cardImageUrl ?? null,
              annualFee: detail?.annualFee ?? null,
              owned: owned.has(c.cardKey),
            };
          }),
        ),
      })),
    );
  },
});
