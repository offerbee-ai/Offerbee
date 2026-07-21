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
// `onDismiss` present ⇒ opened voluntarily from the trial banner (dismissable);
// absent ⇒ hard paywall (only exit is Sign out).
export function Paywall({
  trialEndsAt,
  onDismiss,
}: {
  trialEndsAt: number | null;
  onDismiss?: () => void;
}) {
  const createCheckout = useAction(api.billing.createCheckoutSession);
  const { signOut } = useClerk();
  const [busy, setBusy] = useState<"monthly" | "yearly" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Snapshot at mount — this screen is short-lived, so the countdown doesn't
  // need to tick (and reading Date.now() in render trips react-hooks/purity).
  const [now] = useState(() => Date.now());

  const trialDaysLeft =
    trialEndsAt !== null
      ? Math.max(0, Math.ceil((trialEndsAt - now) / 86_400_000))
      : null;

  const buy = async (plan: "monthly" | "yearly") => {
    setBusy(plan);
    setError(null);
    try {
      const { url } = await createCheckout({ plan, platform: "web" });
      window.location.assign(url); // full nav to Stripe-hosted checkout
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
        onClick={() => (onDismiss ? onDismiss() : signOut())}
        className="mt-8 text-[14px] text-body underline-offset-2 hover:underline"
      >
        {onDismiss ? "Not now" : "Sign out"}
      </button>
    </div>
  );
}
