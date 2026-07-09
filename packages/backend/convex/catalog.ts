import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getUserId } from "./auth";

const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" };

// Search the cached catalog for the add-card flow. Public card data, but gated
// behind login so it's only reachable from the authed app surface.
export const searchCatalog = query({
  args: {
    term: v.string(),
    issuer: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { term, issuer, paginationOpts }) => {
    const userId = await getUserId(ctx);
    if (!userId) return EMPTY_PAGE;

    const trimmed = term.trim();

    if (trimmed.length === 0) {
      // Browse mode: active cards, optionally filtered by issuer.
      const base = issuer
        ? ctx.db
            .query("cardCatalog")
            .withIndex("by_issuer", (q) => q.eq("cardIssuer", issuer))
        : ctx.db.query("cardCatalog");
      return await base
        .filter((q) => q.eq(q.field("isActive"), true))
        .paginate(paginationOpts);
    }

    return await ctx.db
      .query("cardCatalog")
      .withSearchIndex("search_cardName", (q) => {
        const s = q.search("cardName", trimmed).eq("isActive", true);
        return issuer ? s.eq("cardIssuer", issuer) : s;
      })
      .paginate(paginationOpts);
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
