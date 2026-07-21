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
          <h1 className="text-[26px] font-semibold text-ink">
            You&rsquo;re all set 🐝
          </h1>
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
