// packages/backend/convex/billingCore.ts
// Pure billing/entitlement logic — no Convex imports so it unit-tests cleanly
// (same pattern as benefitCycles.ts).

export const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;

export interface BillingUser {
  _creationTime: number;
  trialEndsAt?: number; // manual support override only — never written by app code
  subscriptionStatus?: string; // Stripe status verbatim
  currentPeriodEnd?: number; // ms
}

// Trial runs 14 days from account creation (product decision 2026-07-21: no
// launch-date floor — pre-launch accounts are team/test accounts and simply
// lapse; support can extend any account via the trialEndsAt override).
export function effectiveTrialEnd(u: {
  _creationTime: number;
  trialEndsAt?: number;
}): number {
  return u.trialEndsAt ?? u._creationTime + TRIAL_MS;
}

// Single source of truth for "can this user use the app".
// past_due retains access through Stripe's smart-retry window; access ends
// when Stripe cancels the subscription (subscription.deleted webhook).
export function hasAccess(u: BillingUser, now: number): boolean {
  if (u.subscriptionStatus === "active" || u.subscriptionStatus === "past_due")
    return true;
  // Paid-through grace applies only to canceled subscriptions (deleted before
  // period end). incomplete/unpaid/paused must NOT get it — Stripe stamps
  // current_period_end at creation, before payment ever confirms.
  if (
    u.subscriptionStatus === "canceled" &&
    (u.currentPeriodEnd ?? 0) > now
  )
    return true;
  return effectiveTrialEnd(u) > now;
}

// Shape Stripe sends that we care about. Newer Stripe API versions carry
// current_period_end on the subscription item; older ones on the subscription.
export interface StripeSubscriptionLike {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end: boolean;
  // Scheduled cancellation instant (seconds). The Stripe dashboard's "cancel
  // at end of period" on a trialing/active sub sets THIS (not
  // cancel_at_period_end), so a sync that only reads the boolean would keep
  // showing "Renews …" after a support-side cancel.
  cancel_at?: number | null;
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
  // A scheduled cancel_at caps the access end (it can predate the period end)
  // and counts as "cancels at period end" for display and access logic.
  const endSec =
    sub.cancel_at != null
      ? periodEndSec > 0
        ? Math.min(sub.cancel_at, periodEndSec)
        : sub.cancel_at
      : periodEndSec;
  return {
    stripeCustomerId:
      typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    subscriptionPlan: item?.price.id === priceIds.yearly ? "yearly" : "monthly",
    currentPeriodEnd: endSec * 1000,
    cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at != null,
  };
}
