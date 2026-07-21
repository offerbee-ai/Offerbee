// packages/backend/convex/billing.ts
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import Stripe from "stripe";
import { getUserId, requireUserId } from "./auth";
import { effectiveTrialEnd, hasAccess } from "./billingCore";
import { missingEnvVariableUrl } from "./utils";

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
      // Read-side only — the write guard (requireAccess) denies rowless
      // users instead, since a real write should never precede onboarding.
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
      plan: user.subscriptionPlan ?? null,
      trialEndsAt: user.subscriptionStatus ? null : effectiveTrialEnd(user),
      currentPeriodEnd: user.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd ?? false,
    };
  },
});

// Paywall ledger ("Your trial so far"): what the user actually captured,
// grouped per benefit with card names, plus a reconciling total. The window is
// the account's full claim history — the trial starts at account creation, so
// the two coincide (and a support-extended trial stays consistent with the
// Benefits screen). total 0 ⇒ the client hides the ledger entirely (design
// rule: never show an empty or fake ledger).
export const getTrialLedger = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    const usages = await ctx.db
      .query("benefitUsages")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(500);
    const round = (n: number) => Math.round(n * 100) / 100;

    const byBenefit = new Map<
      Id<"userBenefits">,
      { count: number; amount: number }
    >();
    for (const u of usages) {
      const g = byBenefit.get(u.userBenefitId) ?? { count: 0, amount: 0 };
      g.count += 1;
      g.amount += u.amount;
      byBenefit.set(u.userBenefitId, g);
    }
    const total = round(
      [...byBenefit.values()].reduce((a, g) => a + g.amount, 0),
    );

    // Card names resolve like benefits.listMyCredits: nickname → cardDetails →
    // catalog → raw key. Only the displayed top lines pay the lookups; the
    // total above still covers every claim so it reconciles with Benefits.
    const top = [...byBenefit.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 5);
    const items = [];
    for (const [benefitId, g] of top) {
      const benefit = await ctx.db.get(benefitId);
      if (!benefit) continue; // orphan guard (benefit deleted mid-flight)
      const card = await ctx.db.get(benefit.userCardId);
      const detail = await ctx.db
        .query("cardDetails")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", benefit.cardKey))
        .unique();
      const catalog = detail
        ? null
        : await ctx.db
            .query("cardCatalog")
            .withIndex("by_cardKey", (q) => q.eq("cardKey", benefit.cardKey))
            .unique();
      items.push({
        title: benefit.title,
        cardName:
          card?.nickname ?? detail?.cardName ?? catalog?.cardName ?? benefit.cardKey,
        count: g.count,
        amount: round(g.amount),
      });
    }
    return { total, items };
  },
});

// Defense-in-depth guard for key write paths (client paywall is the primary
// gate). Throws for lapsed users. A missing row is also denied: every
// legitimate guarded write happens after onboarding has upserted the users
// row, so rowless-but-authed here means a client that skipped ensureUser —
// treat as no access rather than an indefinite implicit trial.
export async function requireAccess(ctx: QueryCtx | MutationCtx) {
  const userId = await requireUserId(ctx);
  const user = await userByUserId(ctx, userId);
  if (!user || !hasAccess(user, Date.now())) {
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
          // For checkout's trial_end: bill only after the free trial runs out.
          _creationTime: user._creationTime,
          trialEndsAt: user.trialEndsAt,
        }
      : {
          userId,
          email: undefined,
          stripeCustomerId: undefined,
          subscriptionStatus: undefined,
          _creationTime: undefined,
          trialEndsAt: undefined,
        };
  },
});

// Webhook upsert. Matches by Clerk userId (subscription metadata) first, then
// by stripeCustomerId. Writes the full given state (idempotent). Ordering
// safety is the caller's job: Stripe does not guarantee event order, so the
// webhook handler must sync from a freshly retrieved subscription (not the
// event's embedded snapshot) — see http.ts /stripe/webhook.
export const syncSubscription = internalMutation({
  args: {
    userId: v.optional(v.string()),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    subscriptionStatus: v.string(),
    subscriptionPlan: v.union(v.literal("monthly"), v.literal("yearly")),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, ...patch } = args;
    let user = userId ? await userByUserId(ctx, userId) : null;
    if (!user) {
      try {
        user = await ctx.db
          .query("users")
          .withIndex("by_stripeCustomerId", (q) =>
            q.eq("stripeCustomerId", args.stripeCustomerId),
          )
          .unique();
      } catch {
        // >1 row with this stripeCustomerId — data corruption; don't crash the
        // webhook, surface in logs instead.
        console.error(
          "[stripe] duplicate users for customer",
          args.stripeCustomerId,
        );
        return;
      }
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

// ── Stripe actions (default Convex runtime — fetch HTTP client, no "use node",
//    same convention as plaid.ts) ──

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key)
    throw new Error(
      missingEnvVariableUrl("STRIPE_SECRET_KEY", "https://dashboard.stripe.com/apikeys"),
    );
  // No apiVersion pinned here — rides the SDK's built-in default, which is
  // deterministic per installed `stripe` version (locked via the pnpm
  // lockfile), so behavior is reproducible across deploys without us tracking
  // Stripe's API version string by hand.
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in environment variables`);
  return value;
}

// Returns a Stripe Checkout URL for the chosen plan. `platform` only changes
// the success page copy ("return to the app" on native).
// Native passes its app-scheme deep link (from Linking.createURL) so Stripe's
// success/cancel redirects land back in the app instead of SITE_URL — the
// in-app auth session intercepts the scheme and closes itself. Web omits it.
const RETURN_URL_RE = /^(offerbee(-dev)?|exp):\/\/[\w./?=&%:-]*$/;

export const createCheckoutSession = action({
  args: {
    plan: v.union(v.literal("monthly"), v.literal("yearly")),
    platform: v.union(v.literal("web"), v.literal("native")),
    returnUrl: v.optional(v.string()),
  },
  handler: async (ctx, { plan, platform, returnUrl }): Promise<{ url: string }> => {
    if (returnUrl !== undefined && !RETURN_URL_RE.test(returnUrl)) {
      throw new Error("Invalid returnUrl");
    }
    // Ensure the users row exists before we touch Stripe. A rowless authed
    // caller could otherwise create a customer + pay, but setStripeCustomerId
    // no-ops without a row and the webhook's syncSubscription can never match
    // it back — a real payment invisible to the app. ensureUser is already
    // idempotent (same call web/native make on login), so this is a no-op for
    // the common case where onboarding has already run.
    await ctx.runMutation(api.users.ensureUser, {});

    const me = await ctx.runQuery(internal.billing.getUserForBilling, {});
    if (me.subscriptionStatus === "active" || me.subscriptionStatus === "past_due") {
      throw new Error("ALREADY_SUBSCRIBED");
    }
    const stripe = stripeClient();
    const siteUrl = requiredEnv("SITE_URL");
    const priceId = requiredEnv(
      plan === "monthly" ? "STRIPE_PRICE_ID_MONTHLY" : "STRIPE_PRICE_ID_YEARLY",
    );

    let customerId = me.stripeCustomerId;
    if (!customerId) {
      // idempotencyKey: concurrent calls (double-tap, two devices) resolve to
      // the same Stripe customer instead of racing to create orphans.
      const customer = await stripe.customers.create(
        { email: me.email, metadata: { userId: me.userId } },
        { idempotencyKey: `customer-${me.userId}` },
      );
      customerId = customer.id;
      await ctx.runMutation(internal.billing.setStripeCustomerId, {
        userId: me.userId,
        stripeCustomerId: customerId,
      });
    } else {
      // The DB status can lag the webhook (TOCTOU): a second concurrent call
      // could pass the check above before the first call's webhook lands.
      // Stripe itself is authoritative here — ask it directly rather than
      // trust our cached subscriptionStatus.
      const existing = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      });
      // past_due still holds access (billingCore.hasAccess) — those users must
      // fix their card via the Portal, not buy a second subscription.
      if (
        existing.data.some(
          (s) => s.status === "active" || s.status === "past_due",
        )
      ) {
        throw new Error("ALREADY_SUBSCRIBED");
      }

      // Single-live-session invariant: reuse a still-open session for the same
      // plan+platform (also dedupes attempts across idempotency buckets), and
      // expire any mismatched open sessions so two checkout attempts can never
      // both be completed into duplicate subscriptions. Never expire-then-create
      // with the same key — the idempotent replay would return the expired session.
      const open = await stripe.checkout.sessions.list({
        customer: customerId,
        status: "open",
        limit: 10,
      });
      const reusable = open.data.find(
        (s) =>
          s.metadata?.plan === plan &&
          s.metadata?.platform === platform &&
          (s.metadata?.returnUrl ?? "") === (returnUrl ?? ""),
      );
      if (reusable?.url) return { url: reusable.url };
      for (const s of open.data) {
        try {
          await stripe.checkout.sessions.expire(s.id);
        } catch (err) {
          // 400 invalid_request = the session just left "open" (completed or
          // expired concurrently) — safe to proceed. Anything else (network,
          // rate limit, auth, 5xx) may have left it open: abort instead of
          // minting a second completable session.
          if (!(err instanceof Stripe.errors.StripeInvalidRequestError)) throw err;
        }
      }
    }

    // Bucketed idempotency: dedupes rapid double-taps/retries within a 30-min
    // window without ever replaying a Checkout Session past its expiry
    // (Stripe caches idempotent results for ~24h — session lifetime).
    const idempotencyBucket = Math.floor(Date.now() / (30 * 60 * 1000));

    // Subscribing during the trial must not cut it short (paywall promises
    // "you won't be charged until your trial ends") — pass the remaining trial
    // to Stripe so billing starts at trial end. Stripe rejects trial_end less
    // than 48h out, so inside that window checkout charges immediately and the
    // paywall drops the no-charge copy (same 48h threshold on the client).
    const trialEnd =
      me._creationTime !== undefined
        ? effectiveTrialEnd({
            _creationTime: me._creationTime,
            trialEndsAt: me.trialEndsAt,
          })
        : 0;
    const trialEndSec =
      trialEnd - Date.now() > 48 * 60 * 60 * 1000
        ? Math.floor(trialEnd / 1000)
        : undefined;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: false,
        // Classic Billing, not Managed Payments (Stripe merchant-of-record, the
        // default on new accounts): MoR changes support/refund ownership and tax
        // semantics the integration wasn't designed for.
        managed_payments: { enabled: false },
        metadata: { userId: me.userId, plan, platform, returnUrl: returnUrl ?? "" },
        subscription_data: {
          metadata: { userId: me.userId },
          ...(trialEndSec !== undefined ? { trial_end: trialEndSec } : {}),
        },
        // With a returnUrl, redirects hit the app scheme and the in-app auth
        // session closes itself — SITE_URL (a web origin) never loads on device.
        success_url: returnUrl
          ? `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}outcome=success`
          : `${siteUrl}/app/billing/success?platform=${platform}`,
        cancel_url: returnUrl
          ? `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}outcome=cancel`
          : `${siteUrl}/app`,
      },
      // platform is part of the key: the same (userId, plan) pair with a
      // different platform must NOT reuse a session (success_url differs),
      // and Stripe errors if the same key is replayed with different params.
      // trialEndSec and returnUrl are part of the key too: a replay that
      // crosses the 48h trial_end cutoff (or switches return target, e.g.
      // Expo Go vs dev build) would otherwise reuse a key with different
      // params, which Stripe rejects.
      { idempotencyKey: `checkout-${me.userId}-${plan}-${platform}-${idempotencyBucket}-t${trialEndSec ?? 0}-${returnUrl ?? "web"}` },
    );
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    return { url: session.url };
  },
});

// Stripe-hosted management UI: cancel, switch plan, update card.
export const createPortalSession = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const me = await ctx.runQuery(internal.billing.getUserForBilling, {});
    if (!me.stripeCustomerId) throw new Error("NO_BILLING_ACCOUNT");
    const stripe = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: me.stripeCustomerId,
      return_url: `${requiredEnv("SITE_URL")}/app/settings`,
    });
    return { url: session.url };
  },
});
