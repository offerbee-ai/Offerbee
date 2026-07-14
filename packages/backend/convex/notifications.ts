import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import { getUserId, requireUserId } from "./auth";

const UNREAD_CAP = 50;

// Client-facing feed (consumed by web now, native later — same function).
export const listNotifications = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await getUserId(ctx);
    if (!userId) return { page: [], isDone: true, continueCursor: "" };
    return await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

// Unread badge count, capped so the query stays bounded.
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_isRead", (q) =>
        q.eq("userId", userId).eq("isRead", false),
      )
      .take(UNREAD_CAP);
    return unread.length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const userId = await requireUserId(ctx);
    const notification = await ctx.db.get(notificationId);
    if (!notification) return;
    if (notification.userId !== userId)
      throw new Error(`User '${userId}' cannot modify '${notificationId}'`);
    await ctx.db.patch(notificationId, { isRead: true });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await ctx.scheduler.runAfter(0, internal.notifications.markAllReadBatch, {
      userId,
    });
  },
});

// Runs as a scheduled job (no auth context) with an explicit userId, batching to
// stay within transaction limits.
export const markAllReadBatch = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const batch = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_isRead", (q) =>
        q.eq("userId", userId).eq("isRead", false),
      )
      .take(100);

    for (const n of batch) await ctx.db.patch(n._id, { isRead: true });

    if (batch.length === 100) {
      await ctx.scheduler.runAfter(0, internal.notifications.markAllReadBatch, {
        userId,
      });
    }
  },
});

const RETIRED_TYPES = new Set([
  "perk_lounge", "perk_checked_bag", "perk_free_hotel_night", "perk_trusted_traveler",
  "fx_fee_warning", "spend_bonus_category", "no_fx_alternative", "category_optimizer",
]);

// One-time cleanup: educational "offers" are no longer notifications (moved to the
// web-only Tips & Offers screen). Sweeps the table in pages and deletes retired rows.
export const purgeEducationalNotifications = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("notifications").paginate({ numItems: 100, cursor });
    let deleted = 0;
    for (const n of page.page) {
      if (RETIRED_TYPES.has(n.type)) {
        await ctx.db.delete(n._id);
        deleted += 1;
      }
    }
    console.log(`purgeEducationalNotifications: page done, deleted ${deleted}`);
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.notifications.purgeEducationalNotifications, {
        cursor: page.continueCursor,
      });
    }
  },
});
