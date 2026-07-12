import { useEffect, useMemo } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  ONBOARDING_CARDS_BY_ID,
  type ReminderPrefs,
} from "@packages/backend/convex/onboardingCatalog";

import { Card, NotificationPreview, Text, Toggle } from "@/components/ui";
import { spacing, useTheme } from "@/theme";
import { usd } from "@/features/credits/derive";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { StepChrome } from "@/features/onboarding/StepChrome";

const REMINDER_OPTIONS: { key: keyof ReminderPrefs; label: string; detail: string }[] = [
  { key: "expiry", label: "Expiry alerts", detail: "A nudge before each credit resets" },
  { key: "digest", label: "Weekly digest", detail: "Monday summary of what's available" },
  { key: "renewal", label: "Renewal alerts", detail: "30 days before an annual fee posts" },
  { key: "smart", label: "Smart reminders", detail: "Only when a credit is realistically usable" },
];

export default function OnboardingReminders() {
  const { colors } = useTheme();
  const { cards, reminders, setReminder, setStep } = useOnboarding();

  useEffect(() => setStep(3), [setStep]);

  // Preview the soonest-expiring selected card; fall back to a sample.
  const preview = useMemo(() => {
    const selected = cards
      .map((id) => ONBOARDING_CARDS_BY_ID.get(id))
      .filter((c) => c !== undefined);
    if (selected.length === 0) {
      return {
        title: "Dining credit resets in 2 days",
        body: "Use your $10 Amex Gold credit before it disappears.",
      };
    }
    const soonest = selected.reduce((min, c) => (c.next.days < min.next.days ? c : min));
    return {
      title: `${soonest.next.name} resets in ${soonest.next.days} days`,
      body: `Use your ${usd(soonest.next.amt)} ${soonest.name} credit before it disappears.`,
    };
  }, [cards]);

  return (
    <StepChrome
      step={3}
      title="Never miss a reset."
      subtitle="Choose what OfferBee should nudge you about. You can change these anytime."
      onContinue={() => router.replace("/(onboarding)/primer")}
    >
      <Text variant="sectionLabel" color="tertiary">
        What a nudge looks like
      </Text>
      <View style={{ marginTop: spacing.sm }}>
        <NotificationPreview title={preview.title} body={preview.body} dimmed={!reminders.expiry} />
      </View>

      <Card padded={false} style={{ marginTop: spacing.lg }}>
        {REMINDER_OPTIONS.map((option, i) => (
          <View
            key={option.key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              paddingVertical: spacing.rowPadY,
              paddingHorizontal: spacing.rowPadX,
              borderBottomWidth: i < REMINDER_OPTIONS.length - 1 ? 1 : 0,
              borderBottomColor: colors.separator,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="body">{option.label}</Text>
              <Text variant="subtext" color="secondary" style={{ marginTop: 1 }}>
                {option.detail}
              </Text>
            </View>
            <Toggle
              value={reminders[option.key]}
              onValueChange={(v) => setReminder(option.key, v)}
              accessibilityLabel={option.label}
            />
          </View>
        ))}
      </Card>
    </StepChrome>
  );
}
