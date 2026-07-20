# OfferBee Premium — Stripe Subscriptions (Web + Native)

**Date:** 2026-07-20
**Status:** Approved design, pending implementation plan

## Goal

Monetize OfferBee with a single premium subscription behind a hard paywall:

- **Monthly:** $9.99/month
- **Yearly:** $80/year (~33% savings, $6.67/month equivalent)
- **Trial:** 7 days, no card required, app-managed
- One billing system (Stripe) for both the Next.js web app and the Expo iOS app

## Decisions (locked)

| Decision | Choice | Rationale |
| --- | --- | --- |
| iOS purchases | Stripe-only; native links out to web checkout | US storefront allows external purchase links (post-2025 Epic ruling); OfferBee is US-cards-focused. Avoids Apple's 15–30% cut, StoreKit, and RevenueCat. |
| Gating model | Hard paywall after trial | Whole app requires an active trial or subscription. One gate at app entry, simplest entitlement checks. |
| Trial | 7 days, no card, app-managed | Trial clock derives from user creation time; Stripe is only involved once the user actually subscribes. |
| Existing users | 7-day trial from feature launch | Uniform code path; a launch-date constant floors the trial clock for pre-launch users. |
| Billing stack | Raw Stripe + Convex webhooks | Entitlement lives in Convex where every function can read it. Follows the existing Plaid webhook pattern in `http.ts`. No Clerk Billing fee or native-support gaps. |

## Architecture overview

```
Web paywall ─┐                                        ┌─> Stripe Checkout (hosted)
             ├─> billing.createCheckoutSession ───────┤
Native paywall┘   (Convex action, returns URL)        └─> Stripe Customer Portal (hosted)
                                                                   │
Stripe ──POST /stripe/webhook──> Convex http.ts ──> internal upsert│──> users row billing fields
                                                                   │
Web + native UI <──reactive── billing.getEntitlement <─────────────┘
```

Stripe hosts all payment UI (Checkout + Customer Portal). The apps never touch card data. Convex is the single source of truth for entitlement; both clients subscribe reactively, so a webhook landing flips the paywall everywhere without polling or deep links.

## Data model

New optional fields on the existing `users` table (additive widen, no migration):

```ts
// ── Billing (Stripe). All optional: absent = never subscribed. ──
trialEndsAt: v.optional(v.number()),         // ms; manual override only (support/extensions)
stripeCustomerId: v.optional(v.string()),
stripeSubscriptionId: v.optional(v.string()),
subscriptionStatus: v.optional(v.string()),  // Stripe status: "active" | "past_due" | "canceled" | ...
subscriptionPlan: v.optional(v.string()),    // "monthly" | "yearly"
currentPeriodEnd: v.optional(v.number()),    // ms; paid access runs to here even after cancel
cancelAtPeriodEnd: v.optional(v.boolean()),
```

Optional index: `by_stripeCustomerId` on `users` for webhook lookups (webhook also carries `metadata.userId`, so this is a fallback path).

### Trial derivation (no backfill migration)

Three separate `ctx.db.insert("users", ...)` call sites exist (`users.ts:46`, `users.ts:111`, `users.ts:152`). Rather than stamping `trialEndsAt` in all of them (and backfilling existing rows), the trial end derives from Convex's built-in `_creationTime`:

```ts
const LAUNCH_MS = <deploy date of this feature>; // hardcoded constant
const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

effectiveTrialEnd(user) =
  user.trialEndsAt ?? (Math.max(user._creationTime, LAUNCH_MS) + TRIAL_MS)
```

- New signups: 7 days from account creation.
- Pre-launch users: 7 days from launch.
- `trialEndsAt` field exists solely as a manual override (extend a specific user's trial via dashboard) — it is never written by application code in v1.

### Entitlement (single pure function)

```ts
hasAccess(user, now) =
  subscriptionStatus ∈ {"active", "past_due"}   // past_due = Stripe smart-retry grace window
  || (currentPeriodEnd ?? 0) > now              // canceled-at-period-end keeps access to period end
  || effectiveTrialEnd(user) > now              // trial
```

Pure function in `packages/backend/convex/billing.ts`, unit-tested like the existing `*.test.ts` files. Access is revoked when Stripe gives up retries and sends `customer.subscription.deleted` (status → `canceled`, `currentPeriodEnd` in the past).

## Stripe configuration (per environment)

| Convex deployment | Stripe mode |
| --- | --- |
| dev `agreeable-labrador-799` | test |
| staging `adept-porpoise-776` | test |
| prod `handsome-dodo-841` | live |

- One Product ("OfferBee Premium"), two recurring Prices with lookup keys `premium_monthly` ($9.99/mo) and `premium_yearly` ($80/yr).
- Customer Portal configuration: allow cancel (at period end), plan switching between the two prices (Stripe prorates), payment-method update.
- Webhook endpoint per deployment: `https://<deployment>.convex.site/stripe/webhook`, subscribed to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Convex env vars (dashboard, per deployment): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_YEARLY`.

## Backend (`packages/backend/convex/billing.ts` + `http.ts`)

### Public API

- `getEntitlement` (query) → `{ hasAccess, status, plan, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd }`. Computed server-side at query time; clients also get raw timestamps for countdown UI (queries don't re-run on wall clock, so clients compare timestamps locally for display and the server re-checks at every mutation).
- `createCheckoutSession` (action, `"use node"`) — args `{ plan: "monthly" | "yearly", platform: "web" | "native" }` → `{ url }`. Reuses `stripeCustomerId` or creates a customer (email from users row), sets `metadata.userId` = Clerk subject on both session and subscription, `mode: "subscription"`. `success_url`/`cancel_url` point at the web app.
- `createPortalSession` (action, `"use node"`) → `{ url }`. Requires existing `stripeCustomerId`.

### Webhook (`http.ts`, follows Plaid route pattern)

`POST /stripe/webhook`:

1. Verify signature with `stripe.webhooks.constructEventAsync` + `Stripe.createSubtleCryptoProvider()` (Convex runtime has Web Crypto, not Node crypto — sync `constructEvent` will not work).
2. On any subscription-bearing event, fetch/receive the **full current subscription object** and upsert its state onto the user row (matched by `metadata.userId`, falling back to `stripeCustomerId`). Always-upsert-from-source makes handling idempotent and immune to event ordering/races.
3. Return 200 quickly; schedule internal mutations rather than doing slow work inline.

Handled events: `checkout.session.completed` (links `stripeCustomerId` + initial subscription state), `customer.subscription.created/updated/deleted` (status, plan from price lookup key, `current_period_end`, `cancel_at_period_end`).

### Server-side enforcement (defense in depth)

`requireAccess(ctx, userId)` helper throws when `hasAccess` is false. Applied to the key write paths: `wallet.addCard` / onboarding card confirm, benefit usage logging, Plaid link-token + exchange. Read queries stay ungated (data is invisible behind the client paywall anyway; avoids breaking background jobs like push reminders — see edge cases).

## Web app

- **Gate:** in the authed app shell (`apps/web/src/components/app/AppProvider.tsx` / `AppShell.tsx`): subscribe to `getEntitlement`; while in trial render app + trial countdown banner ("X days left — Upgrade"); when `hasAccess` is false render full-screen paywall (no app chrome).
- **Paywall screen:** plan picker — monthly $9.99 / yearly $80 with "Save 33%" badge, feature recap, CTA → `createCheckoutSession` → `window.location = url`.
- **Success page** (`/app/billing/success`): Checkout redirects here; shows "Activating…" until the reactive entitlement flips (webhook usually lands in <2s), then routes into the app.
- **Settings → Billing:** current plan, renewal/cancel date, "Manage subscription" → `createPortalSession` redirect. Nothing else custom — Portal handles cancel/switch/card update.

## Native app (Expo iOS)

- **Gate:** same `getEntitlement` subscription in the authed layout; full-screen paywall mirroring web (design-system primitives in `src/components/ui`, tokens in `src/theme`).
- **Purchase flow:** CTA → `createCheckoutSession({ platform: "native" })` → open URL with `expo-web-browser` (`openBrowserAsync`). No deep link needed: when the webhook lands, the reactive query flips and the paywall dismisses itself. The success page's copy for `platform: "native"` says "You're all set — return to the app."
- **Settings:** "Manage subscription" → portal URL in browser; shows plan + renewal date from entitlement.
- **App Review:** external-purchase link is allowed for US storefront apps. Keep paywall copy neutral (no "cheaper on web" steering), add an App Review note referencing the external purchase flow. App remains US-region-focused.

## Edge cases

- **Webhook ordering/races:** always upsert from the full subscription object; last write wins with the same source of truth.
- **Cancel at period end:** Stripe keeps status `active` with `cancel_at_period_end: true`; access persists to `currentPeriodEnd`. UI shows "Ends on <date>".
- **Payment failure:** `past_due` retains access through Stripe's retry window; `customer.subscription.deleted` revokes.
- **Refund/dispute:** handled via subscription deletion → revoked.
- **Plan switch:** through Customer Portal; Stripe prorates; webhook updates `subscriptionPlan`.
- **Duplicate checkout:** `createCheckoutSession` returns early with an error if the user already has an active subscription (client also hides the CTA).
- **Trial abuse** (new Clerk account = fresh trial): accepted for v1.
- **Background jobs** (push reminders, offer scans): keep running for lapsed users in v1 — pull-to-refresh visibility is gated at the client and write paths at the server. Optionally add an entitlement check to reminder enqueue later (noted as follow-up, not v1).
- **Clock skew:** server computes `hasAccess` at query/mutation time; client timestamps are display-only.
- **User row missing stripeCustomerId on webhook:** fall back to `metadata.userId`; log and 200 (don't retry-loop Stripe) if genuinely unmatchable.

## Testing

- **Unit:** entitlement pure function (trial derivation incl. `LAUNCH_MS` floor, each status, period-end boundaries) — vitest, colocated `billing.test.ts` like existing tests.
- **Integration (dev):** Stripe test mode + Stripe CLI `stripe listen --forward-to https://agreeable-labrador-799.convex.site/stripe/webhook`; test cards (4242…, decline 4000…0341 for past_due).
- **Trial paths:** tweak `trialEndsAt` override on dev rows to simulate expiry.
- **E2E happy path:** signup → trial banner → force-expire → paywall → test-card checkout → paywall lifts reactively (web via Playwright MCP; native via simulator: paywall → browser checkout → reactive dismiss).

## Rollout

1. Ship behind the natural gate: nothing changes for users until `LAUNCH_MS` + code deploys (pre-launch users' trial floor starts at launch).
2. Dev: full test-mode flow verified.
3. Staging (`preview` branch → staging Convex + Netlify alias): test-mode keys, verify webhook endpoint.
4. Prod: create live Product/Prices/Portal config/webhook, set env vars, merge to `main`. Set `LAUNCH_MS` to the prod deploy date.
5. Native: paywall ships in next TestFlight build (`apps/native` change triggers Xcode Cloud). Backend gate is server-side, so old app versions still enforce correctly — they just render the entitlement state the backend reports.

## Out of scope (v1)

Marketing-site pricing page, promo/referral codes, grandfathering, Google Play billing, restore-purchase UX (entitlement is server-side; signing in restores automatically), dunning emails beyond Stripe defaults, per-user trial extensions UI (manual `trialEndsAt` patch via dashboard suffices).
