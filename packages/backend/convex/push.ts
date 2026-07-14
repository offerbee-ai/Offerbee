import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal, components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { platformValidator } from "./validators";
import { PushNotifications } from "@convex-dev/expo-push-notifications";
import { inQuietHours } from "./pushQuietHours";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const RECEIPT_MIN_AGE_MS = 15 * 60 * 1000; // Expo needs ~15m before receipts exist
const RECEIPT_MAX_AGE_MS = 60 * 60 * 1000;

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

export const getSentTicketsForReceipts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const sent = await ctx.db
      .query("notifications")
      .withIndex("by_deliveryStatus", (q) => q.eq("deliveryStatus", "sent"))
      .take(100);
    return sent
      .filter(
        (n) =>
          n.expoTicketId &&
          n.sentAt &&
          now - n.sentAt >= RECEIPT_MIN_AGE_MS &&
          now - n.sentAt <= RECEIPT_MAX_AGE_MS,
      )
      .map((n) => ({ id: n._id, ticketId: n.expoTicketId as string }));
  },
});

// ── Internal writes ─────────────────────────────────────────────────────────────

export const markSent = internalMutation({
  args: { id: v.id("notifications"), expoTicketId: v.optional(v.string()) },
  handler: async (ctx, { id, expoTicketId }) => {
    await ctx.db.patch(id, {
      deliveryStatus: "sent",
      sentAt: Date.now(),
      expoTicketId,
    });
  },
});

export const markFailed = internalMutation({
  args: { id: v.id("notifications"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    await ctx.db.patch(id, { deliveryStatus: "failed", deliveryError: error });
  },
});

export const markSkipped = internalMutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { deliveryStatus: "skipped" });
  },
});

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

function expoHeaders(): Record<string, string> {
  const base: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const token = process.env.EXPO_ACCESS_TOKEN;
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

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

    type Msg = {
      to: string;
      title: string;
      body: string;
      data: unknown;
      sound: "default";
      notifId: Id<"notifications">;
      token: string;
    };
    const messages: Msg[] = [];

    for (const n of pending) {
      const c = contexts.get(n.userId);
      if (!c || !c.user || c.user.notificationsEnabled === false || c.tokens.length === 0) {
        await ctx.runMutation(internal.push.markSkipped, { id: n._id });
        continue;
      }
      if (inQuietHours(c.user, now)) continue; // leave pending for a later run
      for (const t of c.tokens) {
        messages.push({
          to: t.token,
          title: n.title,
          body: n.body,
          data: n.data ?? {},
          sound: "default",
          notifId: n._id,
          token: t.token,
        });
      }
    }

    const results = new Map<Id<"notifications">, { ok?: string; error?: string }>();
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      let tickets: any[] = [];
      try {
        const res = await fetch(EXPO_SEND_URL, {
          method: "POST",
          headers: expoHeaders(),
          body: JSON.stringify(
            chunk.map((m) => ({
              to: m.to,
              title: m.title,
              body: m.body,
              data: m.data,
              sound: m.sound,
            })),
          ),
        });
        const json = await res.json();
        tickets = Array.isArray(json?.data) ? json.data : [];
      } catch (e) {
        console.error("Expo push send failed", e);
      }
      for (let j = 0; j < chunk.length; j++) {
        const m = chunk[j];
        const ticket = tickets[j];
        if (ticket?.status === "ok") {
          if (!results.get(m.notifId)?.ok)
            results.set(m.notifId, { ok: ticket.id });
        } else {
          const err =
            ticket?.details?.error ?? ticket?.message ?? "delivery failed";
          if (err === "DeviceNotRegistered")
            await ctx.runMutation(internal.push.invalidateToken, {
              token: m.token,
            });
          const prev = results.get(m.notifId);
          if (!prev?.ok) results.set(m.notifId, { ...prev, error: err });
        }
      }
    }

    for (const [id, r] of results) {
      if (r.ok) await ctx.runMutation(internal.push.markSent, { id, expoTicketId: r.ok });
      else await ctx.runMutation(internal.push.markFailed, { id, error: r.error ?? "delivery failed" });
    }

    if (pending.length === 100) {
      await ctx.scheduler.runAfter(0, internal.push.flushPending, {});
    }
  },
});

export const checkReceipts = internalAction({
  args: {},
  handler: async (ctx) => {
    const sent: { id: Id<"notifications">; ticketId: string }[] =
      await ctx.runQuery(internal.push.getSentTicketsForReceipts, {});
    if (sent.length === 0) return;

    let data: Record<string, any> = {};
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify({ ids: sent.map((s) => s.ticketId) }),
      });
      const json = await res.json();
      data = json?.data ?? {};
    } catch (e) {
      console.error("Expo receipts fetch failed", e);
      return;
    }

    for (const s of sent) {
      const r = data[s.ticketId];
      if (r?.status === "error") {
        await ctx.runMutation(internal.push.markFailed, {
          id: s.id,
          error: r?.details?.error ?? r?.message ?? "receipt error",
        });
      }
    }
  },
});
