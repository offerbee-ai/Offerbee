import { Redirect } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

import { STEP_ROUTES } from "@/features/onboarding/StepChrome";

// Resume where the user left off (updateOnboarding persists the step).
// Step 1 is the name confirm (skipped when a name already exists); step 2
// resumes at the Plaid-first gate (connect.tsx) — wallet stays the canonical
// STEP_ROUTES entry for skip/fallback navigation.
export default function OnboardingEntry() {
  const me = useQuery(api.users.getMe);
  if (me === undefined) return null;
  const step = Math.min(5, Math.max(1, me?.onboardingStep ?? 1));
  const hasName = Boolean((me?.firstName ?? me?.name)?.trim());
  const href =
    step === 1
      ? hasName
        ? "/(onboarding)/connect"
        : "/(onboarding)/name"
      : step === 2
        ? "/(onboarding)/connect"
        : STEP_ROUTES[step - 1];
  return <Redirect href={href} />;
}
