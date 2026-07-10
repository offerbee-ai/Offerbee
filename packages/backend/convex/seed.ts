import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ── Preview-deployment seed ──────────────────────────────────────────────────
// Run by `convex deploy --preview-run seed:run` when a PR spins up a fresh
// preview backend (see apps/web/netlify.toml [context.deploy-preview] and
// .github/workflows/preview-web.yml). Preview databases start empty, so this
// populates the card catalog with a few well-known cards to give the app
// browseable content without any live RapidAPI calls.
//
// Only the catalog is seeded: user-scoped data (wallet, notifications) is keyed
// by the signed-in Clerk subject, which we don't know at seed time, so a tester
// signs in and adds cards themselves.
//
// Idempotent (upsert by cardKey) so re-running on an updated preview is safe.
// Internal so it can never be invoked by clients — only via the deploy key.

const SAMPLE_CARDS = [
  {
    cardKey: "chase-sapphire-preferred",
    cardName: "Chase Sapphire Preferred",
    cardIssuer: "Chase",
  },
  {
    cardKey: "chase-sapphire-reserve",
    cardName: "Chase Sapphire Reserve",
    cardIssuer: "Chase",
  },
  {
    cardKey: "amex-gold",
    cardName: "American Express Gold Card",
    cardIssuer: "American Express",
  },
  {
    cardKey: "amex-platinum",
    cardName: "The Platinum Card from American Express",
    cardIssuer: "American Express",
  },
  {
    cardKey: "capital-one-venture-x",
    cardName: "Capital One Venture X Rewards",
    cardIssuer: "Capital One",
  },
  {
    cardKey: "citi-double-cash",
    cardName: "Citi Double Cash Card",
    cardIssuer: "Citi",
  },
];

export const run = internalMutation({
  args: {},
  returns: v.object({ seeded: v.number(), inserted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;
    for (const card of SAMPLE_CARDS) {
      const existing = await ctx.db
        .query("cardCatalog")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", card.cardKey))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...card, lastSyncedAt: now });
      } else {
        await ctx.db.insert("cardCatalog", {
          ...card,
          isActive: true,
          lastSyncedAt: now,
        });
        inserted += 1;
      }
    }
    return { seeded: SAMPLE_CARDS.length, inserted };
  },
});
