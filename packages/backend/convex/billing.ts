// packages/backend/convex/billing.ts
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getUserId, requireUserId } from "./auth";
import { effectiveTrialEnd, hasAccess } from "./billingCore";

async function userByUserId(ctx: QueryCtx | MutationCtx, userId: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

// Reactive entitlement for both clients. `hasAccess` is computed server-side at
// query time; timestamps are returned for client-side countdown display (query
// results don't re-evaluate as wall-clock advances — clients tick locally and
// every guarded mutation re-checks on the server).
export const getEntitlement = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    const user = await userByUserId(ctx, userId);
    const now = Date.now();
    if (!user) {
      // Row not created yet (ensureUser races the first render). Brand-new
      // account ⇒ in trial by definition; the row lands within seconds.
      return {
        hasAccess: true,
        status: "trialing" as const,
        plan: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }
    return {
      hasAccess: hasAccess(user, now),
      status: user.subscriptionStatus ?? ("trialing" as const),
      plan: (user.subscriptionPlan ?? null) as "monthly" | "yearly" | null,
      trialEndsAt: user.subscriptionStatus ? null : effectiveTrialEnd(user),
      currentPeriodEnd: user.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd ?? false,
    };
  },
});

// Defense-in-depth guard for key write paths (client paywall is the primary
// gate). Throws for lapsed users; missing row = brand-new account = in trial.
export async function requireAccess(ctx: QueryCtx | MutationCtx) {
  const userId = await requireUserId(ctx);
  const user = await userByUserId(ctx, userId);
  if (user && !hasAccess(user, Date.now())) {
    throw new Error("SUBSCRIPTION_REQUIRED");
  }
  return userId;
}

// Action-side variant (actions have no ctx.db): call via ctx.runQuery.
export const assertAccess = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireAccess(ctx);
  },
});

// Used by checkout/portal actions to read billing identity.
export const getUserForBilling = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await userByUserId(ctx, userId);
    return user
      ? {
          userId,
          email: user.email,
          stripeCustomerId: user.stripeCustomerId,
          subscriptionStatus: user.subscriptionStatus,
        }
      : { userId, email: undefined, stripeCustomerId: undefined, subscriptionStatus: undefined };
  },
});

// Webhook upsert. Matches by Clerk userId (subscription metadata) first, then
// by stripeCustomerId. Always writes the full latest state — idempotent and
// immune to event ordering.
export const syncSubscription = internalMutation({
  args: {
    userId: v.optional(v.string()),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    subscriptionStatus: v.string(),
    subscriptionPlan: v.string(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, ...patch } = args;
    let user = userId ? await userByUserId(ctx, userId) : null;
    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_stripeCustomerId", (q) =>
          q.eq("stripeCustomerId", args.stripeCustomerId),
        )
        .unique();
    }
    if (!user) {
      // Unmatchable — log and swallow (returning 500 would make Stripe retry
      // an event we'll never be able to apply).
      console.error("[stripe] no user for customer", args.stripeCustomerId);
      return;
    }
    await ctx.db.patch(user._id, patch);
  },
});

// Links the Stripe customer to the user at checkout time (subscription events
// then match by either key).
export const setStripeCustomerId = internalMutation({
  args: { userId: v.string(), stripeCustomerId: v.string() },
  handler: async (ctx, { userId, stripeCustomerId }) => {
    const user = await userByUserId(ctx, userId);
    if (user && user.stripeCustomerId !== stripeCustomerId) {
      await ctx.db.patch(user._id, { stripeCustomerId });
    }
  },
});
