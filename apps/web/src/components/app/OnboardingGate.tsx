"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Spinner } from "@/components/app/ui";

/**
 * Routes users who still owe onboarding from /app to /welcome:
 * - no users row yet (brand-new sign-up that skipped the wizard redirect), or
 * - a row with onboardingStep set but no completion stamp (started, unfinished).
 * Rows without onboarding fields (accounts that predate the wizard, or created
 * from the native app) pass straight through — onboarding is for new users only.
 *
 * Must sit between RequireAuth and AppShell: AppShell's ensureUser would
 * otherwise create the row before we can observe that it was missing. getMe
 * is skipped until the Convex token is exchanged because it also returns null
 * for unauthenticated callers.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.getMe, isAuthenticated ? {} : "skip");

  const needsOnboarding =
    me === null ||
    (me !== undefined &&
      me.onboardingStep !== undefined &&
      !me.onboardingCompletedAt);

  useEffect(() => {
    if (isAuthenticated && me !== undefined && needsOnboarding)
      router.replace("/welcome");
  }, [isAuthenticated, me, needsOnboarding, router]);

  if (!isAuthenticated || me === undefined || needsOnboarding)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );

  return <>{children}</>;
}
