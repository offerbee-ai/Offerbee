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

  it("incomplete status with future currentPeriodEnd: no access (unpaid)", () => {
    expect(
      hasAccess(
        { ...base, subscriptionStatus: "incomplete", currentPeriodEnd: now + DAY },
        now,
      ),
    ).toBe(false);
  });

  it("unpaid status with future currentPeriodEnd: no access", () => {
    expect(
      hasAccess(
        { ...base, subscriptionStatus: "unpaid", currentPeriodEnd: now + DAY },
        now,
      ),
    ).toBe(false);
  });

  it("trial boundary: effectiveTrialEnd exactly equal to now is not access (exclusive >)", () => {
    const trialEndsExactlyNow = { _creationTime: now - TRIAL_MS };
    expect(hasAccess(trialEndsExactlyNow, now)).toBe(false);
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

  it("unknown price id falls back to monthly", () => {
    const sub = {
      id: "sub_3",
      customer: "cus_3",
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: "price_unknown" }, current_period_end: 1_800_000_000 }],
      },
    };
    expect(subscriptionPatchFromStripe(sub, priceIds).subscriptionPlan).toBe(
      "monthly",
    );
  });
});
