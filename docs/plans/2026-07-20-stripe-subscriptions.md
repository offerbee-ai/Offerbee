# OfferBee Premium (Stripe Subscriptions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-paywall OfferBee behind a Stripe subscription ($9.99/mo, $80/yr) with a 7-day no-card trial, on web and native, per `docs/specs/2026-07-20-stripe-subscriptions-design.md`.

**Architecture:** Stripe hosts all payment UI (Checkout + Customer Portal). Convex owns entitlement: billing fields live on the `users` row, a webhook (`/stripe/webhook` on `http.ts`) upserts subscription state, and both clients gate reactively on `billing.getEntitlement`. Trial derives from `_creationTime` with a launch-date floor — no migration. Native links out to web checkout (US storefront external-purchase rules); Convex reactivity dismisses the paywall when the webhook lands, so no deep link.

**Tech Stack:** Convex (default runtime — Stripe SDK via `createFetchHttpClient`, webhook verify via `createSubtleCryptoProvider`; matches the no-`"use node"` codebase convention, same as `plaid.ts`), `stripe` npm, Next.js 16 App Router, Expo Router `Stack.Protected` guards, `expo-web-browser` (already a native dep), vitest.

---

## Prerequisites (manual, once per environment — do dev now, staging/prod at rollout)

In the **Stripe dashboard (test mode)**:
1. Create Product "OfferBee Premium" with two recurring Prices: $9.99/month (lookup key `premium_monthly`), $80/year (lookup key `premium_yearly`).
2. Enable the Customer Portal (Settings → Billing → Customer portal): allow cancel at period end, allow switching between the two prices, allow payment-method update.
3. Create a webhook endpoint pointed at `https://agreeable-labrador-799.convex.site/stripe/webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy its signing secret.

In the **Convex dashboard** (dev deployment `agreeable-labrador-799`), set env vars:
- `STRIPE_SECRET_KEY` — test-mode secret key
- `STRIPE_WEBHOOK_SECRET` — signing secret from step 3
- `STRIPE_PRICE_ID_MONTHLY` / `STRIPE_PRICE_ID_YEARLY` — the two price IDs
- `SITE_URL` — `http://localhost:3000` on dev (staging: the staging Netlify alias; prod: `https://offerbee.ai`)

## File structure

**Create:**
- `packages/backend/convex/billingCore.ts` — pure entitlement logic (no Convex imports; unit-testable like `benefitCycles.ts`)
- `packages/backend/convex/billingCore.test.ts` — vitest for the pure logic
- `packages/backend/convex/billing.ts` — Convex surface: `getEntitlement` query, checkout/portal actions, internal sync mutation, access-guard helpers
- `apps/web/src/components/app/Paywall.tsx` — plan-picker screen (also used as overlay from trial banner)
- `apps/web/src/components/app/PaywallGate.tsx` — reactive gate + trial banner host
- `apps/web/src/app/app/billing/success/page.tsx` — post-checkout "activating…" page
- `apps/native/src/features/billing/useEntitlement.ts` — entitlement hook
- `apps/native/src/app/paywall.tsx` — native paywall screen
- `apps/native/src/features/billing/openCheckout.ts` — checkout/portal link-out helpers

**Modify:**
- `packages/backend/convex/schema.ts:20-45` — billing fields on `users`
- `packages/backend/convex/http.ts` — `/stripe/webhook` route
- `packages/backend/convex/wallet.ts:38` (`addCard`), `packages/backend/convex/benefits.ts:378` (`logUsage`), `packages/backend/convex/plaid.ts:80,105,350` (`createLinkToken`, `exchangePublicToken`, `confirmDetectedCards`) — server-side access guards
- `apps/web/src/app/app/layout.tsx` — mount `PaywallGate`
- `apps/web/src/app/app/settings/page.tsx` — billing section
- `apps/native/src/app/_layout.tsx:24-84` — entitlement guard in `Stack.Protected` tree
- `apps/native/src/app/settings.tsx` — billing row

---

### Task 0: Branch + dependency

- [ ] **Step 1: Create feature branch**

```bash
git checkout preview && git pull && git checkout -b feat/stripe-subscriptions
```

- [ ] **Step 2: Install Stripe SDK in the backend package** (pnpm only — workspace rule)

```bash
pnpm --filter @packages/backend add stripe
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/package.json pnpm-lock.yaml
git commit -m "chore(backend): add stripe sdk"
```

### Task 1: Pure entitlement logic (`billingCore.ts`) — TDD

**Files:**
- Create: `packages/backend/convex/billingCore.ts`
- Test: `packages/backend/convex/billingCore.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/backend/convex/billingCore.test.ts
import { describe, expect, it } from "vitest";
import {
  LAUNCH_MS,
  TRIAL_MS,
  effectiveTrialEnd,
  hasAccess,
  subscriptionPatchFromStripe,
} from "./billingCore";

const DAY = 24 * 60 * 60 * 1000;

describe("effectiveTrialEnd", () => {
  it("post-launch signup: creation + 7d", () => {
    const created = LAUNCH_MS + 5 * DAY;
    expect(effectiveTrialEnd({ _creationTime: created })).toBe(created + TRIAL_MS);
  });

  it("pre-launch user: floored to launch + 7d", () => {
    expect(effectiveTrialEnd({ _creationTime: LAUNCH_MS - 90 * DAY })).toBe(
      LAUNCH_MS + TRIAL_MS,
    );
  });

  it("manual trialEndsAt override wins", () => {
    expect(
      effectiveTrialEnd({ _creationTime: 0, trialEndsAt: 12345 }),
    ).toBe(12345);
  });
});

describe("hasAccess", () => {
  const now = LAUNCH_MS + 30 * DAY;
  const base = { _creationTime: LAUNCH_MS }; // trial long expired at `now`

  it("in-trial user has access", () => {
    expect(hasAccess({ _creationTime: now - 2 * DAY }, now)).toBe(true);
  });

  it("expired trial, no subscription: no access", () => {
    expect(hasAccess(base, now)).toBe(false);
  });

  it("active subscription has access", () => {
    expect(hasAccess({ ...base, subscriptionStatus: "active" }, now)).toBe(true);
  });

  it("past_due keeps access (Stripe retry grace)", () => {
    expect(hasAccess({ ...base, subscriptionStatus: "past_due" }, now)).toBe(true);
  });

  it("canceled but period not ended: access until period end", () => {
    expect(
      hasAccess(
        { ...base, subscriptionStatus: "canceled", currentPeriodEnd: now + DAY },
        now,
      ),
    ).toBe(true);
  });

  it("canceled and period ended: no access", () => {
    expect(
      hasAccess(
        { ...base, subscriptionStatus: "canceled", currentPeriodEnd: now - DAY },
        now,
      ),
    ).toBe(false);
  });
});

describe("subscriptionPatchFromStripe", () => {
  const priceIds = { monthly: "price_m", yearly: "price_y" };

  it("maps a live subscription object", () => {
    const sub = {
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: "price_y" }, current_period_end: 1_800_000_000 }],
      },
    };
    expect(subscriptionPatchFromStripe(sub, priceIds)).toEqual({
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "active",
      subscriptionPlan: "yearly",
      currentPeriodEnd: 1_800_000_000 * 1000,
      cancelAtPeriodEnd: false,
    });
  });

  it("falls back to top-level current_period_end (older API shape)", () => {
    const sub = {
      id: "sub_2",
      customer: "cus_2",
      status: "past_due",
      cancel_at_period_end: true,
      current_period_end: 1_700_000_000,
      items: { data: [{ price: { id: "price_m" } }] },
    };
    const patch = subscriptionPatchFromStripe(sub, priceIds);
    expect(patch.currentPeriodEnd).toBe(1_700_000_000 * 1000);
    expect(patch.subscriptionPlan).toBe("monthly");
    expect(patch.cancelAtPeriodEnd).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
pnpm --filter @packages/backend test -- billingCore
```
Expected: FAIL — `Cannot find module './billingCore'`.

- [ ] **Step 3: Implement `billingCore.ts`**

```ts
// packages/backend/convex/billingCore.ts
// Pure billing/entitlement logic — no Convex imports so it unit-tests cleanly
// (same pattern as benefitCycles.ts).

export const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

// Launch floor for the trial clock: users created before this date get 7 days
// from LAUNCH, not from account creation. Set to the prod deploy date of the
// paywall before merging to main.
export const LAUNCH_MS = Date.UTC(2026, 6, 27); // 2026-07-27

export interface BillingUser {
  _creationTime: number;
  trialEndsAt?: number; // manual support override only — never written by app code
  subscriptionStatus?: string; // Stripe status verbatim
  currentPeriodEnd?: number; // ms
}

export function effectiveTrialEnd(u: {
  _creationTime: number;
  trialEndsAt?: number;
}): number {
  return u.trialEndsAt ?? Math.max(u._creationTime, LAUNCH_MS) + TRIAL_MS;
}

// Single source of truth for "can this user use the app".
// past_due retains access through Stripe's smart-retry window; access ends
// when Stripe cancels the subscription (subscription.deleted webhook).
export function hasAccess(u: BillingUser, now: number): boolean {
  if (u.subscriptionStatus === "active" || u.subscriptionStatus === "past_due")
    return true;
  if ((u.currentPeriodEnd ?? 0) > now) return true;
  return effectiveTrialEnd(u) > now;
}

// Shape Stripe sends that we care about. Newer Stripe API versions carry
// current_period_end on the subscription item; older ones on the subscription.
export interface StripeSubscriptionLike {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end: boolean;
  current_period_end?: number; // seconds (older API shape)
  items: {
    data: Array<{ price: { id: string }; current_period_end?: number }>;
  };
}

export interface SubscriptionPatch {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  subscriptionStatus: string;
  subscriptionPlan: "monthly" | "yearly";
  currentPeriodEnd: number; // ms
  cancelAtPeriodEnd: boolean;
}

export function subscriptionPatchFromStripe(
  sub: StripeSubscriptionLike,
  priceIds: { monthly: string; yearly: string },
): SubscriptionPatch {
  const item = sub.items.data[0];
  const periodEndSec = item?.current_period_end ?? sub.current_period_end ?? 0;
  return {
    stripeCustomerId:
      typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    subscriptionPlan: item?.price.id === priceIds.yearly ? "yearly" : "monthly",
    currentPeriodEnd: periodEndSec * 1000,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
pnpm --filter @packages/backend test -- billingCore
```
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/convex/billingCore.ts packages/backend/convex/billingCore.test.ts
git commit -m "feat(backend): pure billing entitlement logic with launch-floored trial"
```

### Task 2: Schema — billing fields on `users`

**Files:**
- Modify: `packages/backend/convex/schema.ts:20-45`

- [ ] **Step 1: Add fields + index.** In the `users` table definition, after `welcomeEmailSentAt` (line 44), add:

```ts
    // ── Billing (Stripe). All optional: absent = never subscribed. Entitlement
    //    is derived in billingCore.hasAccess — trial comes from _creationTime
    //    (launch-floored), so no backfill was needed. ──
    trialEndsAt: v.optional(v.number()), // ms; manual support override only
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()), // Stripe status verbatim
    subscriptionPlan: v.optional(v.string()), // "monthly" | "yearly"
    currentPeriodEnd: v.optional(v.number()), // ms
    cancelAtPeriodEnd: v.optional(v.boolean()),
```

and change the table's index chain (line 45) to:

```ts
  })
    .index("by_userId", ["userId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),
```

- [ ] **Step 2: Push schema + regenerate types** (Convex CLI is logged in; run from `packages/backend`)

```bash
cd packages/backend && pnpm exec convex dev --once && cd ../..
```
Expected: schema pushed to dev `agreeable-labrador-799`, `_generated/` updated, no validation errors (all-new fields optional).

- [ ] **Step 3: Commit**

```bash
git add packages/backend/convex/schema.ts
git commit -m "feat(backend): users billing fields + stripeCustomerId index"
```

### Task 3: `billing.ts` — entitlement query, sync mutation, access guards

**Files:**
- Create: `packages/backend/convex/billing.ts`

- [ ] **Step 1: Implement queries/mutations/guards**

```ts
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
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @packages/backend typecheck
```
Expected: clean. (`convex dev --once` from Task 2 regenerated types; rerun it if `internal.billing.*` types are missing.)

- [ ] **Step 3: Commit**

```bash
git add packages/backend/convex/billing.ts
git commit -m "feat(backend): entitlement query, subscription sync, access guards"
```

### Task 4: Checkout + Portal actions

**Files:**
- Modify: `packages/backend/convex/billing.ts` (append)

- [ ] **Step 1: Append Stripe client helper + actions to `billing.ts`**

```ts
// ── Stripe actions (default Convex runtime — fetch HTTP client, no "use node",
//    same convention as plaid.ts) ──
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";
import { missingEnvVariableUrl } from "./utils";

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key)
    throw new Error(
      missingEnvVariableUrl("STRIPE_SECRET_KEY", "https://dashboard.stripe.com/apikeys"),
    );
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in environment variables`);
  return value;
}

// Returns a Stripe Checkout URL for the chosen plan. `platform` only changes
// the success page copy ("return to the app" on native).
export const createCheckoutSession = action({
  args: {
    plan: v.union(v.literal("monthly"), v.literal("yearly")),
    platform: v.union(v.literal("web"), v.literal("native")),
  },
  handler: async (ctx, { plan, platform }): Promise<{ url: string }> => {
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
      const customer = await stripe.customers.create({
        email: me.email,
        metadata: { userId: me.userId },
      });
      customerId = customer.id;
      await ctx.runMutation(internal.billing.setStripeCustomerId, {
        userId: me.userId,
        stripeCustomerId: customerId,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: false,
      metadata: { userId: me.userId },
      subscription_data: { metadata: { userId: me.userId } },
      success_url: `${siteUrl}/app/billing/success?platform=${platform}`,
      cancel_url: `${siteUrl}/app`,
    });
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
```

Consolidate the imports at the top of the file (single `./_generated/server` import with `action`, single import block).

- [ ] **Step 2: Typecheck + deploy to dev**

```bash
pnpm --filter @packages/backend typecheck && cd packages/backend && pnpm exec convex dev --once && cd ../..
```
Expected: clean push.

- [ ] **Step 3: Smoke-test checkout URL from CLI** (requires Task-prereq env vars on dev)

```bash
cd packages/backend && pnpm exec convex run billing:createCheckoutSession '{"plan":"monthly","platform":"web"}' --identity '{"subject":"<any dev user id>"}' 2>&1 | head -5; cd ../..
```
Expected: `{ url: "https://checkout.stripe.com/c/pay/..." }` (or run later via the web UI in Task 6 if `--identity` impersonation is unavailable on this CLI version).

- [ ] **Step 4: Commit**

```bash
git add packages/backend/convex/billing.ts
git commit -m "feat(backend): stripe checkout + customer portal actions"
```

### Task 5: Webhook route

**Files:**
- Modify: `packages/backend/convex/http.ts`

- [ ] **Step 1: Add the route** after the Plaid route (before `export default http;`):

```ts
import Stripe from "stripe";
import { subscriptionPatchFromStripe } from "./billingCore";
import type { StripeSubscriptionLike } from "./billingCore";

// Stripe billing webhook. Signature-verified (async provider — the Convex
// runtime has Web Crypto, not Node crypto). Strategy: every subscription event
// upserts the FULL current subscription state onto the user row, which makes
// handling idempotent and immune to event ordering.
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!secret || !key) return new Response("not configured", { status: 500 });

    const stripe = new Stripe(key, {
      httpClient: Stripe.createFetchHttpClient(),
    });
    const signature = request.headers.get("stripe-signature");
    if (!signature) return new Response("missing signature", { status: 400 });

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        await request.text(),
        signature,
        secret,
        undefined,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch (err) {
      console.error("[stripe webhook] bad signature", err);
      return new Response("bad signature", { status: 400 });
    }

    const priceIds = {
      monthly: process.env.STRIPE_PRICE_ID_MONTHLY ?? "",
      yearly: process.env.STRIPE_PRICE_ID_YEARLY ?? "",
    };

    const syncFromSubscription = async (sub: Stripe.Subscription) => {
      const patch = subscriptionPatchFromStripe(
        sub as unknown as StripeSubscriptionLike,
        priceIds,
      );
      await ctx.runMutation(internal.billing.syncSubscription, {
        userId: sub.metadata?.userId || undefined,
        ...patch,
      });
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // Link the customer immediately; the subscription events (created
        // alongside) carry the authoritative state, but fetch it here too so a
        // dropped sibling event can't leave us stale.
        if (session.metadata?.userId && typeof session.customer === "string") {
          await ctx.runMutation(internal.billing.setStripeCustomerId, {
            userId: session.metadata.userId,
            stripeCustomerId: session.customer,
          });
        }
        if (typeof session.subscription === "string") {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await syncFromSubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncFromSubscription(event.data.object);
        break;
      }
    }

    return new Response("ok", { status: 200 });
  }),
});
```

- [ ] **Step 2: Typecheck + push**

```bash
pnpm --filter @packages/backend typecheck && cd packages/backend && pnpm exec convex dev --once && cd ../..
```

- [ ] **Step 3: Verify signature rejection**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://agreeable-labrador-799.convex.site/stripe/webhook -d '{}'
```
Expected: `400`.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/convex/http.ts
git commit -m "feat(backend): stripe webhook with async signature verification"
```

### Task 6: Server-side access guards on key write paths

**Files:**
- Modify: `packages/backend/convex/wallet.ts:38` (`addCard` handler, first lines)
- Modify: `packages/backend/convex/benefits.ts:378` (`logUsage` handler, first lines)
- Modify: `packages/backend/convex/plaid.ts:80,105,350` (`createLinkToken`, `exchangePublicToken`, `confirmDetectedCards`)

- [ ] **Step 1: Guard mutations.** In `wallet.ts` `addCard` and `benefits.ts` `logUsage`, replace the leading `const userId = await requireUserId(ctx);` with:

```ts
    const userId = await requireAccess(ctx); // subscription/trial gate + auth
```

adding the import `import { requireAccess } from "./billing";` to each file. (`requireAccess` returns the userId, so downstream code is unchanged.)

- [ ] **Step 2: Guard Plaid actions.** In each of the three plaid actions, immediately after the existing `requireUserId`/auth line, add:

```ts
    await ctx.runQuery(internal.billing.assertAccess, {});
```

(`plaid.ts` already imports `internal`.)

- [ ] **Step 3: Typecheck + run full backend tests**

```bash
pnpm --filter @packages/backend typecheck && pnpm --filter @packages/backend test
```
Expected: clean; existing tests untouched.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/convex/wallet.ts packages/backend/convex/benefits.ts packages/backend/convex/plaid.ts
git commit -m "feat(backend): enforce subscription access on key write paths"
```

### Task 7: Web — Paywall + PaywallGate

**Files:**
- Create: `apps/web/src/components/app/Paywall.tsx`
- Create: `apps/web/src/components/app/PaywallGate.tsx`
- Modify: `apps/web/src/app/app/layout.tsx`

- [ ] **Step 1: `Paywall.tsx`** — plan picker. Match the app's design language (Tailwind tokens used across `components/app/*`: `bg-surface`, `text-ink`, `text-body`, accent classes — mirror `apps/web/src/components/landing/Hero.tsx` button styling):

```tsx
"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useClerk } from "@clerk/nextjs";

const PLANS = [
  {
    id: "monthly" as const,
    name: "Monthly",
    price: "$9.99",
    per: "/month",
    note: "Cancel anytime",
  },
  {
    id: "yearly" as const,
    name: "Yearly",
    price: "$80",
    per: "/year",
    note: "$6.67/mo — save 33%",
    badge: "Best value",
  },
];

// Full-screen hard paywall (also rendered as the upgrade surface from the
// trial banner). Stripe Checkout hosts all payment UI.
export function Paywall({ trialEndsAt }: { trialEndsAt: number | null }) {
  const createCheckout = useAction(api.billing.createCheckoutSession);
  const { signOut } = useClerk();
  const [busy, setBusy] = useState<"monthly" | "yearly" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trialDaysLeft =
    trialEndsAt !== null
      ? Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86_400_000))
      : null;

  const buy = async (plan: "monthly" | "yearly") => {
    setBusy(plan);
    setError(null);
    try {
      const { url } = await createCheckout({ plan, platform: "web" });
      window.location.href = url;
    } catch {
      setError("Couldn't start checkout. Please try again.");
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-12">
      <h1 className="text-[28px] font-semibold text-ink">
        {trialDaysLeft && trialDaysLeft > 0
          ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your trial`
          : "Your free trial has ended"}
      </h1>
      <p className="mt-2 max-w-[36em] text-center text-[16px] text-body">
        Keep every statement credit working for you — reminders before resets,
        fee-vs-value verdicts at renewal, and automatic credit detection.
      </p>

      <div className="mt-8 grid w-full max-w-[560px] gap-4 sm:grid-cols-2">
        {PLANS.map((p) => (
          <button
            key={p.id}
            onClick={() => buy(p.id)}
            disabled={busy !== null}
            className="relative rounded-[16px] border border-[#DAD2C2] bg-surface p-6 text-left transition-colors hover:border-accent disabled:opacity-60"
          >
            {p.badge && (
              <span className="absolute -top-3 right-4 rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-white">
                {p.badge}
              </span>
            )}
            <div className="text-[15px] font-medium text-body">{p.name}</div>
            <div className="mt-1 text-[26px] font-semibold text-ink">
              {p.price}
              <span className="text-[15px] font-normal text-body">{p.per}</span>
            </div>
            <div className="mt-1 text-[13px] text-body">{p.note}</div>
            <div className="mt-4 rounded-[10px] bg-accent px-4 py-2 text-center text-[15px] font-semibold text-white">
              {busy === p.id ? "Redirecting…" : "Subscribe"}
            </div>
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-[14px] text-red-600">{error}</p>}

      <button
        onClick={() => signOut()}
        className="mt-8 text-[14px] text-body underline-offset-2 hover:underline"
      >
        Sign out
      </button>
    </div>
  );
}
```

- [ ] **Step 2: `PaywallGate.tsx`** — reactive gate + trial banner:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Paywall } from "./Paywall";

// Hard paywall for the product area. Order matters in app/layout.tsx:
// RequireAuth > OnboardingGate > PaywallGate > AppShell — the gate needs an
// authed identity, and onboarding finishes inside the trial so it stays first.
// The /app/billing/success route bypasses the gate: it renders while the
// checkout webhook is still in flight.
export function PaywallGate({ children }: { children: ReactNode }) {
  const entitlement = useQuery(api.billing.getEntitlement);
  const pathname = usePathname();

  // Minute tick so an in-session trial expiry drops the gate without a reload
  // (query results don't re-evaluate on wall-clock).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (pathname?.startsWith("/app/billing/success")) return <>{children}</>;
  if (entitlement === undefined) return null; // loading — OnboardingGate already showed a shell
  if (entitlement === null) return null; // unauthenticated; RequireAuth handles redirect

  const trialExpiredLocally =
    entitlement.trialEndsAt !== null && entitlement.trialEndsAt <= now;
  if (!entitlement.hasAccess || (entitlement.status === "trialing" && trialExpiredLocally && !entitlement.currentPeriodEnd)) {
    return <Paywall trialEndsAt={entitlement.trialEndsAt} />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 3: Mount in `apps/web/src/app/app/layout.tsx`:**

```tsx
import { PaywallGate } from "@/components/app/PaywallGate";
// ...
      <OnboardingGate>
        <PaywallGate>
          <AppShell>{children}</AppShell>
        </PaywallGate>
      </OnboardingGate>
```

- [ ] **Step 4: Verify in browser** — `pnpm --filter web-app dev`; sign in with a dev user; app renders (in trial). Patch that user's `trialEndsAt` to a past timestamp via the Convex dashboard → paywall appears reactively. Click Subscribe → Stripe test checkout loads (card 4242 4242 4242 4242).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/app/Paywall.tsx apps/web/src/components/app/PaywallGate.tsx apps/web/src/app/app/layout.tsx
git commit -m "feat(web): hard paywall gate with plan picker"
```

### Task 8: Web — success page + settings billing section

**Files:**
- Create: `apps/web/src/app/app/billing/success/page.tsx`
- Modify: `apps/web/src/app/app/settings/page.tsx`

- [ ] **Step 1: Success page** (bypassed by PaywallGate; waits for the webhook to flip entitlement):

```tsx
"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

function SuccessInner() {
  const entitlement = useQuery(api.billing.getEntitlement);
  const router = useRouter();
  const isNative = useSearchParams().get("platform") === "native";
  const active = entitlement?.hasAccess && !!entitlement?.plan;

  useEffect(() => {
    if (active && !isNative) {
      const t = setTimeout(() => router.replace("/app"), 1200);
      return () => clearTimeout(t);
    }
  }, [active, isNative, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      {active ? (
        <>
          <h1 className="text-[26px] font-semibold text-ink">You're all set 🐝</h1>
          <p className="mt-2 text-[16px] text-body">
            {isNative
              ? "Subscription active — head back to the OfferBee app."
              : "Subscription active — taking you to your dashboard."}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-[26px] font-semibold text-ink">Activating…</h1>
          <p className="mt-2 text-[16px] text-body">
            Confirming your subscription with Stripe. This takes a few seconds.
          </p>
        </>
      )}
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Settings billing section.** Read `apps/web/src/app/app/settings/page.tsx` first and follow its existing section markup/components. Add a "Billing" section rendering from `useQuery(api.billing.getEntitlement)`:
  - Trial (no `plan`): "Free trial — ends <date from trialEndsAt>" + "Upgrade" button → render `<Paywall/>` route: link to `/app` is pointless; instead reuse checkout directly with two buttons (Monthly/Yearly) calling `useAction(api.billing.createCheckoutSession)` exactly as `Paywall.tsx` does.
  - Subscribed: "OfferBee Premium — <Monthly|Yearly>", renewal line (`cancelAtPeriodEnd` ? `Ends on <currentPeriodEnd date>` : `Renews on <currentPeriodEnd date>`), and a "Manage subscription" button:

```tsx
const portal = useAction(api.billing.createPortalSession);
// onClick:
const { url } = await portal({});
window.location.href = url;
```

- [ ] **Step 3: Verify in browser** — settings shows trial state; after a test-card subscription (Task 7 step 4 flow), shows plan + renewal date; Manage opens the Stripe portal; cancel in portal → settings shows "Ends on …" after webhook lands.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/app/billing/success/page.tsx apps/web/src/app/app/settings/page.tsx
git commit -m "feat(web): checkout success page + settings billing section"
```

### Task 9: Native — entitlement hook, paywall screen, layout guard, settings row

**Files:**
- Create: `apps/native/src/features/billing/useEntitlement.ts`
- Create: `apps/native/src/features/billing/openCheckout.ts`
- Create: `apps/native/src/app/paywall.tsx`
- Modify: `apps/native/src/app/_layout.tsx:24-84`
- Modify: `apps/native/src/app/settings.tsx`

- [ ] **Step 1: Hook + link-out helpers**

```ts
// apps/native/src/features/billing/useEntitlement.ts
import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

export function useEntitlement() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.billing.getEntitlement, isAuthenticated ? {} : "skip");
}
```

```ts
// apps/native/src/features/billing/openCheckout.ts
import * as WebBrowser from "expo-web-browser";
import { useAction } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

// Opens Stripe Checkout in an in-app browser. No deep link back: the
// entitlement query is reactive, so the paywall guard dismisses itself the
// moment the webhook lands.
export function useOpenCheckout() {
  const createCheckout = useAction(api.billing.createCheckoutSession);
  return async (plan: "monthly" | "yearly") => {
    const { url } = await createCheckout({ plan, platform: "native" });
    await WebBrowser.openBrowserAsync(url);
  };
}

export function useOpenPortal() {
  const createPortal = useAction(api.billing.createPortalSession);
  return async () => {
    const { url } = await createPortal({});
    await WebBrowser.openBrowserAsync(url);
  };
}
```

- [ ] **Step 2: Paywall screen** — use the design-system primitives (`Screen`, `Text`, `Button`, `Card`, `Badge` from `@/components/ui`, theme via `useTheme`). Mirror the web copy/plans. Read `apps/native/src/app/(onboarding)/primer.tsx` first for the house full-screen layout idiom, then build:

```tsx
// apps/native/src/app/paywall.tsx
import { useState } from "react";
import { View, Pressable } from "react-native";
import { useClerk } from "@clerk/expo";
import { Screen, Text, Button, Badge } from "@/components/ui";
import { useTheme } from "@/theme";
import { useEntitlement } from "@/features/billing/useEntitlement";
import { useOpenCheckout } from "@/features/billing/openCheckout";

const PLANS = [
  { id: "monthly" as const, name: "Monthly", price: "$9.99", per: "/month", note: "Cancel anytime" },
  { id: "yearly" as const, name: "Yearly", price: "$80", per: "/year", note: "$6.67/mo — save 33%", badge: "Best value" },
];

export default function PaywallScreen() {
  const { colors, spacing } = useTheme();
  const { signOut } = useClerk();
  const entitlement = useEntitlement();
  const openCheckout = useOpenCheckout();
  const [busy, setBusy] = useState<"monthly" | "yearly" | null>(null);

  const trialEndsAt = entitlement?.trialEndsAt ?? null;
  const daysLeft =
    trialEndsAt !== null ? Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86_400_000)) : null;

  const buy = async (plan: "monthly" | "yearly") => {
    setBusy(plan);
    try {
      await openCheckout(plan);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.lg, padding: spacing.lg }}>
        <Text variant="title">
          {daysLeft && daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your trial` : "Your free trial has ended"}
        </Text>
        <Text variant="body" color={colors.textSecondary}>
          Keep every statement credit working for you — reminders before resets,
          fee-vs-value verdicts at renewal, and automatic credit detection.
        </Text>

        {PLANS.map((p) => (
          <Pressable
            key={p.id}
            disabled={busy !== null}
            onPress={() => buy(p.id)}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: spacing.lg,
              gap: 4,
            }}
          >
            {p.badge ? <Badge label={p.badge} /> : null}
            <Text variant="label">{p.name}</Text>
            <Text variant="title">
              {p.price}
              <Text variant="body" color={colors.textSecondary}> {p.per}</Text>
            </Text>
            <Text variant="caption" color={colors.textSecondary}>{p.note}</Text>
            <Button
              label={busy === p.id ? "Opening…" : "Subscribe"}
              onPress={() => buy(p.id)}
              disabled={busy !== null}
            />
          </Pressable>
        ))}

        <Pressable onPress={() => signOut()}>
          <Text variant="caption" color={colors.textSecondary} style={{ textAlign: "center" }}>
            Sign out
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
```

Adjust `Text`/`Button`/`Badge` prop names to the actual primitive APIs (check `@/components/ui` exports while implementing — variants above are indicative, the file must compile against the real props).

- [ ] **Step 3: Guard in `_layout.tsx`.** In `RootNavigator`:

```tsx
import { useEntitlement } from "@/features/billing/useEntitlement";
// inside RootNavigator():
const entitlement = useEntitlement();
// extend splash-hold (line 43-44):
const entitlementPending = isAuthenticated && entitlement === undefined;
const ready = fontsReady && !authLoading && !profilePending && !entitlementPending;
// derive:
const paywalled = isAuthenticated && onboarded && entitlement !== undefined && entitlement !== null && !entitlement.hasAccess;
```

and update the guard tree:

```tsx
        <Stack.Protected guard={isAuthenticated && onboarded && paywalled}>
          <Stack.Screen name="paywall" />
        </Stack.Protected>

        <Stack.Protected guard={isAuthenticated && onboarded && !paywalled}>
          <Stack.Screen name="(tabs)" />
          {/* ...existing screens unchanged... */}
        </Stack.Protected>
```

(Onboarding group stays as-is — onboarding always happens inside the trial.)

- [ ] **Step 4: Settings billing row.** Read `apps/native/src/app/settings.tsx`, follow its `ListRow`/section idiom. Add a "Billing" section:
  - Subscribed (`entitlement?.plan`): row "OfferBee Premium — Monthly|Yearly", subtitle `cancelAtPeriodEnd ? "Ends <date>" : "Renews <date>"`, tap → `useOpenPortal()`.
  - Trial: row "Free trial — <daysLeft> days left"; no action (paywall handles purchase when the trial lapses; buying early isn't a v1 flow on native).

- [ ] **Step 5: Verify in simulator** — `pnpm --filter native-app dev` (Expo Go fine — no Plaid screens involved): trial user sees app + settings trial row; set `trialEndsAt` past via dashboard → paywall screen replaces tabs reactively; Subscribe opens Stripe test checkout in the in-app browser; complete with 4242 card → paywall dismisses within seconds of the webhook.

- [ ] **Step 6: Commit**

```bash
git add apps/native/src/features/billing apps/native/src/app/paywall.tsx apps/native/src/app/_layout.tsx apps/native/src/app/settings.tsx
git commit -m "feat(native): paywall screen, entitlement guard, billing settings"
```

### Task 10: End-to-end verification + docs

**Files:**
- Modify: `CLAUDE.md` (Environment section), `README.md` (features/env if applicable)

- [ ] **Step 1: Full webhook round-trip on dev** (Stripe CLI, in case dashboard endpoint wasn't used):

```bash
stripe listen --forward-to https://agreeable-labrador-799.convex.site/stripe/webhook
# separate terminal:
stripe trigger customer.subscription.updated
```
Expected: Convex dev logs show the webhook handled; unmatchable test customer logs `[stripe] no user for customer` and returns 200.

- [ ] **Step 2: Full user journey (web)** — fresh Clerk test account → onboarding → app in trial → dashboard-patch `trialEndsAt` to past → paywall → yearly checkout with 4242 → success page → app restored; settings shows "Renews on <date>"; portal cancel → "Ends on <date>"; portal plan-switch → plan label updates.

- [ ] **Step 3: Decline path** — new checkout with card `4000 0000 0000 0341` (attaches, then fails invoice): subscription lands `past_due`?  If Checkout blocks it upfront, simulate instead: subscribe with 4242, then in Stripe dashboard set the subscription's payment method to a failing card and advance the invoice — verify `past_due` retains access, then cancel the subscription in the dashboard → access revoked reactively.

- [ ] **Step 4: Run everything**

```bash
pnpm --filter @packages/backend test && pnpm typecheck && pnpm build
```
Expected: all green.

- [ ] **Step 5: Document env vars.** In `CLAUDE.md` Environment section add: Convex-side env now also includes `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_YEARLY`, `SITE_URL` (per deployment; test keys on dev/staging, live on prod). Note the launch constant: `billingCore.LAUNCH_MS` must be set to the prod deploy date before merging to `main`.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: stripe billing env vars + launch constant note"
```

### Task 11: Rollout checklist (staging → prod, at ship time — not part of the PR)

- [ ] Staging (`adept-porpoise-776`): repeat Prerequisites with test keys, `SITE_URL` = staging Netlify alias; verify webhook 400s unsigned requests.
- [ ] Prod (`handsome-dodo-841`): live-mode Product/Prices/Portal/webhook, live env vars, `SITE_URL=https://offerbee.ai`.
- [ ] Update `LAUNCH_MS` in `billingCore.ts` to the actual prod deploy date; merge to `main`.
- [ ] Native: TestFlight build picks up `apps/native` changes automatically (Xcode Cloud). Add App Review note about the external purchase link (US storefront).
- [ ] Post-launch smoke: one real live-mode subscription + refund.

---

## Self-review notes (resolved inline)

- Spec coverage: every spec section maps to a task (data model → T1/T2, Stripe config → prereqs/T11, backend API → T3/T4, webhook → T5, enforcement → T6, web → T7/T8, native → T9, testing → T1/T10, rollout → T11).
- `getEntitlement.trialEndsAt` returns `null` once a subscription exists — both paywall UIs handle `null` ("trial ended" copy).
- Type consistency: `subscriptionPatchFromStripe` output keys exactly match `syncSubscription` args (minus `userId`).
- Known judgment calls for the implementer: exact primitive props in the native paywall (Step-2 note), settings-page markup follows whatever exists in each settings file.
