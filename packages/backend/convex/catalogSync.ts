import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { cardDetailContentValidator } from "./validators";

const DETAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // refresh cached details weekly

// ── Sync bookkeeping ──────────────────────────────────────────────────────────

async function upsertSyncState(
  ctx: MutationCtx,
  key: string,
  patch: {
    status: "idle" | "running" | "error";
    lastRunStartedAt?: number;
    lastRunFinishedAt?: number;
    lastError?: string;
    cardsSeen?: number;
    cardsUpserted?: number;
  },
) {
  const existing = await ctx.db
    .query("syncState")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing) await ctx.db.patch(existing._id, patch);
  else await ctx.db.insert("syncState", { key, ...patch });
}

export const beginSync = internalMutation({
  args: { key: v.string(), startedAt: v.number() },
  handler: async (ctx, { key, startedAt }) => {
    await upsertSyncState(ctx, key, {
      status: "running",
      lastRunStartedAt: startedAt,
    });
  },
});

export const failSync = internalMutation({
  args: { key: v.string(), error: v.string() },
  handler: async (ctx, { key, error }) => {
    await upsertSyncState(ctx, key, { status: "error", lastError: error });
  },
});

// ── Catalog upsert ─────────────────────────────────────────────────────────────

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

// Flip cards not seen in this run to inactive (delisted upstream), batched.
export const finishCatalogSync = internalMutation({
  args: { runStartedAt: v.number(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { runStartedAt, cursor }) => {
    const page = await ctx.db
      .query("cardCatalog")
      .paginate({ numItems: 500, cursor });

    for (const row of page.page) {
      if (row.isActive && row.lastSyncedAt < runStartedAt) {
        await ctx.db.patch(row._id, { isActive: false });
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.catalogSync.finishCatalogSync, {
        runStartedAt,
        cursor: page.continueCursor,
      });
    } else {
      await upsertSyncState(ctx, "catalog", {
        status: "idle",
        lastRunFinishedAt: Date.now(),
      });
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
