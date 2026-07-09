import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { cardDetailContentValidator } from "./validators";

const DETAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // refresh cached details weekly

// ── Catalog cache (populated opportunistically from live name searches) ─────────

export const upsertCatalogBatch = internalMutation({
  args: {
    cards: v.array(
      v.object({
        cardKey: v.string(),
        cardName: v.string(),
        cardIssuer: v.string(),
        isActive: v.boolean(),
      }),
    ),
    runStartedAt: v.number(),
  },
  handler: async (ctx, { cards, runStartedAt }) => {
    for (const card of cards) {
      const existing = await ctx.db
        .query("cardCatalog")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", card.cardKey))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...card, lastSyncedAt: runStartedAt });
      } else {
        await ctx.db.insert("cardCatalog", {
          ...card,
          lastSyncedAt: runStartedAt,
        });
      }
    }
  },
});

// ── Card detail cache ───────────────────────────────────────────────────────────

// Oldest cached details past their TTL — bounds the expensive per-card calls.
export const getStaleDetailCards = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const cutoff = Date.now() - DETAIL_TTL_MS;
    const stale = await ctx.db
      .query("cardDetails")
      .withIndex("by_detailFetchedAt", (q) => q.lt("detailFetchedAt", cutoff))
      .order("asc")
      .take(limit);
    return stale.map((d) => ({ cardKey: d.cardKey }));
  },
});

export const saveCardDetail = internalMutation({
  args: {
    cardKey: v.string(),
    content: cardDetailContentValidator,
    hash: v.string(),
  },
  handler: async (ctx, { cardKey, content, hash }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .unique();

    if (!existing) {
      await ctx.db.insert("cardDetails", {
        ...content,
        detailFetchedAt: now,
        detailHash: hash,
      });
      await ctx.scheduler.runAfter(0, internal.offers.rescanCard, { cardKey });
      return;
    }

    if (existing.detailHash === hash) {
      // Unchanged — just bump freshness so it leaves the stale window.
      await ctx.db.patch(existing._id, { detailFetchedAt: now });
      return;
    }

    await ctx.db.patch(existing._id, {
      ...content,
      detailFetchedAt: now,
      detailHash: hash,
    });
    await ctx.scheduler.runAfter(0, internal.offers.rescanCard, { cardKey });
  },
});
