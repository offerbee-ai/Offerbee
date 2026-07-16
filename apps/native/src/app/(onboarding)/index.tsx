import { Redirect } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

import { STEP_ROUTES } from "@/features/onboarding/StepChrome";

// Resume where the user left off (updateOnboarding persists the step).
// Step 1 resumes at the Plaid-first gate (connect.tsx) — wallet stays the
// canonical STEP_ROUTES entry for skip/fallback navigation.
export default function OnboardingEntry() {
  const me = useQuery(api.users.getMe);
  if (me === undefined) return null;
  const step = Math.min(4, Math.max(1, me?.onboardingStep ?? 1));
  return (
    <Redirect
      href={step === 1 ? "/(onboarding)/connect" : STEP_ROUTES[step - 1]}
    />
  );
}
