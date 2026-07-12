import { Stack } from "expo-router";

import { OnboardingProvider } from "@/features/onboarding/OnboardingProvider";

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          animation: "fade",
        }}
      />
    </OnboardingProvider>
  );
}
