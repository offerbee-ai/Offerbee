import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserId, requireUserId } from "./auth";

// Called by BOTH the web and native apps on login so the offer engine can
// enumerate every user regardless of which app they signed up on.
export const ensureUser = mutation({
  args: {
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { email, name }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      const patch: { email?: string; name?: string } = {};
      if (email !== undefined) patch.email = email;
      if (name !== undefined) patch.name = name;
      if (Object.keys(patch).length > 0) await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      userId,
      email,
      name,
      notificationsEnabled: true,
    });
  },
});

// Read the current user's profile + notification preferences.
export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const updateNotificationPrefs = mutation({
  args: {
    notificationsEnabled: v.optional(v.boolean()),
    enabledOfferTypes: v.optional(v.array(v.string())),
    timeZone: v.optional(v.string()),
    quietHoursStart: v.optional(v.number()),
    quietHoursEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!existing) {
      return await ctx.db.insert("users", {
        userId,
        notificationsEnabled: args.notificationsEnabled ?? true,
        enabledOfferTypes: args.enabledOfferTypes,
        timeZone: args.timeZone,
        quietHoursStart: args.quietHoursStart,
        quietHoursEnd: args.quietHoursEnd,
      });
    }

    await ctx.db.patch(existing._id, args);
    return existing._id;
  },
});

// Lets a setup/status screen show whether the external card API is configured.
export const rapidApiKeySet = query({
  args: {},
  handler: async () => {
    return Boolean(process.env.RAPIDAPI_KEY);
  },
});
