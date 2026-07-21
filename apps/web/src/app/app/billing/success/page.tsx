"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

function SuccessInner() {
  const entitlement = useQuery(api.billing.getEntitlement);
  const router = useRouter();
  const isNative = useSearchParams().get("platform") === "native";
  const active = entitlement?.hasAccess && !!entitlement?.plan;
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (active && !isNative) {
      const t = setTimeout(() => router.replace("/app"), 1200);
      return () => clearTimeout(t);
    }
  }, [active, isNative, router]);

  // A user who reaches this URL without a completed checkout (bookmark/direct
  // nav), or a real payer whose webhook is slow, would otherwise sit on
  // "takes a few seconds" forever. After a beat, stop implying it's imminent
  // and offer an explicit way back; the live query still flips the happy path
  // instantly if activation lands. The setState runs in an async timer
  // callback, so it doesn't trip react-hooks/set-state-in-effect (that rule
  // targets synchronous setState in the effect body).
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 12_000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      {active ? (
        <>
          <h1 className="text-[26px] font-semibold text-ink">
            You&rsquo;re all set 🐝
          </h1>
          <p className="mt-2 text-[16px] text-body">
            {isNative
              ? "Subscription active — head back to the OfferBee app."
              : "Subscription active — taking you to your dashboard."}
          </p>
        </>
      ) : timedOut ? (
        <>
          <h1 className="text-[26px] font-semibold text-ink">Activating…</h1>
          <p className="mt-2 max-w-[34em] text-[16px] text-body">
            Taking longer than expected — your subscription will activate
            automatically. You can head back now.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/app")}
            className="mt-6 rounded-[11px] bg-accent px-5 py-2.5 text-[15px] font-semibold text-on-accent transition-colors hover:bg-accent-strong"
          >
            Back to dashboard
          </button>
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
