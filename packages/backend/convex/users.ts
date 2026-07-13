import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getUserId, requireUserId } from "./auth";
import { reminderPrefsValidator } from "./validators";

// Called by BOTH the web and native apps on login so the offer engine can
// enumerate every user regardless of which app they signed up on.
export const ensureUser = mutation({
  args: {
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { email, name }) => {
    const userId = await requireUserId(ctx);
    // Prefer the client-supplied email; fall back to the Clerk identity claim
    // (requires the "email" claim on the convex JWT template — see auth.ts).
    const identityEmail = (await ctx.auth.getUserIdentity())?.email ?? undefined;
    const resolvedEmail = email ?? identityEmail;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      const patch: { email?: string; name?: string } = {};
      if (resolvedEmail !== undefined && resolvedEmail !== existing.email)
        patch.email = resolvedEmail;
      if (name !== undefined && name !== existing.name) patch.name = name;
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existing._id, patch);
        // Keep the Brevo marketing contact in sync on email/name change.
        if (resolvedEmail) {
          const firstName = name ?? existing.name;
          await ctx.scheduler.runAfter(0, internal.email.upsertBrevoContact, {
            email: resolvedEmail,
            attributes: firstName ? { FIRSTNAME: firstName } : {},
          });
        }
      }
      return existing._id;
    }

    const userDocId = await ctx.db.insert("users", {
      userId,
      email: resolvedEmail,
      name,
      notificationsEnabled: true,
    });

    // New user: fire welcome + marketing sync. Both are idempotent and run
    // out-of-band via the scheduler so a Brevo hiccup never blocks sign-in.
    await ctx.scheduler.runAfter(0, internal.email.sendWelcomeEmail, {
      userDocId,
    });
    if (resolvedEmail) {
      await ctx.scheduler.runAfter(0, internal.email.upsertBrevoContact, {
        email: resolvedEmail,
        attributes: name ? { FIRSTNAME: name } : {},
      });
    }

    return userDocId;
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
    // Per-reminder toggles, shared with the onboarding wizard. Editable from
    // Settings after onboarding (updateOnboarding is locked once finished).
    reminderPrefs: v.optional(reminderPrefsValidator),
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
        reminderPrefs: args.reminderPrefs,
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
