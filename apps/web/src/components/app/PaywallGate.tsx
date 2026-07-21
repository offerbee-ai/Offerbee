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
function TrialBanner({
  daysLeft,
  onUpgrade,
}: {
  daysLeft: number;
  onUpgrade: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3 border-b border-[#DAD2C2] bg-surface px-4 py-2 text-[14px] text-ink">
      <span>
        Free trial — {daysLeft} day{daysLeft === 1 ? "" : "s"} left
      </span>
      <button
        onClick={onUpgrade}
        className="font-semibold text-accent underline-offset-2 hover:underline"
      >
        Upgrade
      </button>
    </div>
  );
}

export function PaywallGate({ children }: { children: ReactNode }) {
  const entitlement = useQuery(api.billing.getEntitlement);
  const pathname = usePathname();
  const [showPaywall, setShowPaywall] = useState(false);

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

  // In-trial: app + countdown banner (spec: "X days left — Upgrade"), with a
  // dismissable upgrade overlay when the banner CTA is tapped.
  const inTrial =
    entitlement.status === "trialing" && entitlement.trialEndsAt !== null;
  if (inTrial && showPaywall) {
    return (
      <Paywall
        trialEndsAt={entitlement.trialEndsAt}
        onDismiss={() => setShowPaywall(false)}
      />
    );
  }
  const daysLeft = inTrial
    ? Math.max(0, Math.ceil((entitlement.trialEndsAt! - now) / 86_400_000))
    : 0;
  return (
    <>
      {inTrial && (
        <TrialBanner daysLeft={daysLeft} onUpgrade={() => setShowPaywall(true)} />
      )}
      {children}
    </>
  );
}
