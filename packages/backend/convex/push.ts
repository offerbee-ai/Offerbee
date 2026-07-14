import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal, components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { platformValidator } from "./validators";
import { PushNotifications } from "@convex-dev/expo-push-notifications";
import { inQuietHours } from "./pushQuietHours";

// Recipient key = the push-token string itself (not our Convex userId) —
// each device token is tracked as its own recipient in the component.
const pushClient = new PushNotifications<string>(components.pushNotifications);

// ── Registration (called by native now; usable by web push later) ───────────────

export const registerPushToken = mutation({
  args: {
    token: v.string(),
    deviceId: v.optional(v.string()),
    platform: v.optional(platformValidator),
  },
  handler: async (ctx, { token, deviceId, platform }) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) throw new Error("Authenticated user was required");

    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    const now = Date.now();
    let id: Id<"pushTokens">;
    if (existing) {
      await ctx.db.patch(existing._id, {
        userId,
        deviceId,
        platform,
        lastSeenAt: now,
        isValid: true,
      });
      id = existing._id;
    } else {
      id = await ctx.db.insert("pushTokens", {
        userId,
        token,
        deviceId,
        platform,
        lastSeenAt: now,
        isValid: true,
      });
    }
    await pushClient.recordToken(ctx, { userId: token, pushToken: token });
    return id;
  },
});

export const unregisterPushToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) return;
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (existing && existing.userId === userId) {
      await ctx.db.patch(existing._id, { isValid: false });
      await pushClient.removeToken(ctx, { userId: token });
    }
  },
});

// ── Internal reads ──────────────────────────────────────────────────────────────

export const getPendingBatch = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_deliveryStatus", (q) => q.eq("deliveryStatus", "pending"))
      .take(limit);
  },
});

export const getUserPushContext = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const tokens = (
      await ctx.db
        .query("pushTokens")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(50)
    ).filter((t) => t.isValid);
    return { user, tokens };
  },
});

// ── Internal writes ─────────────────────────────────────────────────────────────

export const markSent = internalMutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { deliveryStatus: "sent", sentAt: Date.now() });
  },
});

export const markSkipped = internalMutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { deliveryStatus: "skipped" });
  },
});

// Currently unused — the Expo push component now handles dead-token detection
// itself (via allowUnregisteredTokens / pause semantics), so nothing calls this
// anymore. Left in place in case we need a manual/administrative invalidation path.
export const invalidateToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { isValid: false });
      await pushClient.removeToken(ctx, { userId: token });
    }
  },
});

// ── Delivery ────────────────────────────────────────────────────────────────────
// Delivery is handed off to the Convex Expo Push component (pushClient), which
// owns batching, retries, and receipt polling. We just gate on quiet-hours /
// the master switch and mark our own `notifications` outbox rows.

// Android notification channels (registered client-side in
// apps/native/src/lib/notifications.ts) — one per category, keyed by
// notification type so each push lands on the right channel.
const CHANNEL_FOR_TYPE: Record<string, string> = {
  credit_expiring: "expiry",
  credit_digest: "digest",
  credit_suggested: "transactions",
  annual_fee_due: "renewal",
  signup_deadline: "renewal",
};

export const flushPending = internalAction({
  args: {},
  handler: async (ctx) => {
    const pending: Doc<"notifications">[] = await ctx.runQuery(
      internal.push.getPendingBatch,
      { limit: 100 },
    );
    if (pending.length === 0) return;
    const now = Date.now();

    const contexts = new Map<
      string,
      { user: Doc<"users"> | null; tokens: Doc<"pushTokens">[] }
    >();
    for (const userId of new Set(pending.map((n) => n.userId))) {
      contexts.set(
        userId,
        await ctx.runQuery(internal.push.getUserPushContext, { userId }),
      );
    }

    for (const n of pending) {
      const c = contexts.get(n.userId);
      if (!c || !c.user || c.user.notificationsEnabled === false || c.tokens.length === 0) {
        await ctx.runMutation(internal.push.markSkipped, { id: n._id });
        continue;
      }
      if (inQuietHours(c.user, now)) continue; // leave pending; a later run delivers
      let anyEnqueued = false;
      for (const t of c.tokens) {
        try {
          await pushClient.sendPushNotification(ctx, {
            userId: t.token,
            notification: {
              title: n.title,
              body: n.body,
              data: n.data ?? {},
              sound: "default",
              channelId: CHANNEL_FOR_TYPE[n.type] ?? "default",
            },
            allowUnregisteredTokens: true,
          });
          anyEnqueued = true;
        } catch (e) {
          console.error("push: sendPushNotification failed for a token", e);
        }
      }
      // Mark sent if at least one device was handed off (prevents re-sending to
      // already-succeeded devices on retry). If EVERY token threw (e.g. transient
      // component outage), leave it pending so a later run retries — no silent drop.
      if (anyEnqueued) {
        await ctx.runMutation(internal.push.markSent, { id: n._id });
      }
    }

    if (pending.length === 100) {
      await ctx.scheduler.runAfter(0, internal.push.flushPending, {});
    }
  },
});
