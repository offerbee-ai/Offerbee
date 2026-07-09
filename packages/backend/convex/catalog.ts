import { query } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./auth";

// Card search is a live action against the API's name-search endpoint — see
// rapidapi.searchCards (the API has no bulk card-list endpoint to cache).

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
