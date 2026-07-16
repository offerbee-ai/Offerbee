import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getUserId, requireUserId } from "./auth";
import { notificationCategoriesValidator, reminderPrefsValidator } from "./validators";
import { normalizeProfileName, hasValidFirstName } from "./profileName";

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

// Save the user's first/last name (onboarding name step + future Settings edit).
// Mirrors the name into Convex so server-side consumers (welcome email, Brevo
// marketing sync) and the native settings screen see it; the web/native UIs also
// write it to Clerk so the identity provider stays the source of truth. Requires
// a non-empty first name so no user is ever nameless.
export const setProfileName = mutation({
  args: {
    firstName: v.string(),
    lastName: v.optional(v.string()),
  },
  handler: async (ctx, { firstName, lastName }) => {
    const userId = await requireUserId(ctx);
    if (!hasValidFirstName(firstName)) {
      throw new Error("First name is required");
    }
    const normalized = normalizeProfileName(firstName, lastName);
    const patch = {
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      name: normalized.name,
    };

    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const docId = existing
      ? (await ctx.db.patch(existing._id, patch), existing._id)
      : await ctx.db.insert("users", {
          userId,
          notificationsEnabled: true,
          ...patch,
        });

    // Keep the Brevo marketing contact's first name in sync when we know the email.
    const email = existing?.email ?? (await ctx.auth.getUserIdentity())?.email;
    if (email) {
      await ctx.scheduler.runAfter(0, internal.email.upsertBrevoContact, {
        email,
        attributes: { FIRSTNAME: normalized.firstName },
      });
    }

    return docId;
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
    // Unified notification-preference categories (Notifications v2). Coexists
    // with reminderPrefs until a later task migrates users off the old field.
    notificationCategories: v.optional(notificationCategoriesValidator),
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
        notificationCategories: args.notificationCategories,
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
