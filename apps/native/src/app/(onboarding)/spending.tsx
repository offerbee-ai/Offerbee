import { useEffect, useMemo } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ONBOARDING_CATEGORIES } from "@packages/backend/convex/onboardingCatalog";

import { Chip, Icon, Text } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { StepChrome } from "@/features/onboarding/StepChrome";

export default function OnboardingSpending() {
  const { colors } = useTheme();
  const { categories, toggleCategory, setStep } = useOnboarding();

  useEffect(() => setStep(3), [setStep]);

  const matching = useMemo(
    () =>
      ONBOARDING_CATEGORIES.filter((c) => categories.includes(c.key)).reduce(
        (sum, c) => sum + c.matchingCredits,
        0,
      ),
    [categories],
  );

  return (
    <StepChrome
      step={3}
      title="What do you actually spend on?"
      subtitle="We'll surface the credits that match how you actually spend."
      onContinue={() => router.replace("/(onboarding)/reminders")}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {ONBOARDING_CATEGORIES.map((category) => (
          <Chip
            key={category.key}
            label={category.label}
            selected={categories.includes(category.key)}
            onPress={() => toggleCategory(category.key)}
          />
        ))}
      </View>

      {/* Live feedback pill */}
      <View
        style={{
          marginTop: spacing.lg,
          backgroundColor: colors.accentSoft,
          borderRadius: radius.chip,
          paddingVertical: 11,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
        }}
      >
        <Icon name="sparkle" size={16} color="accentDeep" />
        <Text variant="body" color="accentDeep" style={{ flex: 1, fontSize: 13.5 }}>
          {categories.length > 0
            ? `Nice — ${matching} matching credits move to the top of your feed.`
            : "Pick a few — we'll rank every credit around them."}
        </Text>
      </View>
    </StepChrome>
  );
}
