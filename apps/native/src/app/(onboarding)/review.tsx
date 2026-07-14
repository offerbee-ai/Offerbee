import { useEffect, useMemo } from "react";
import { View } from "react-native";
import { ONBOARDING_CARDS_BY_ID } from "@packages/backend/convex/onboardingCatalog";

import { Card, CardArt, Text } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { usd } from "@/features/credits/derive";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { StepChrome } from "@/features/onboarding/StepChrome";
import { DaysTile } from "@/features/credits/components/DaysTile";

export default function OnboardingReview() {
  const { colors } = useTheme();
  const { cards, notificationCategories, creditsInPlay, complete, completing, setStep } =
    useOnboarding();

  useEffect(() => setStep(4), [setStep]);

  const selected = useMemo(
    () => cards.map((id) => ONBOARDING_CARDS_BY_ID.get(id)).filter((c) => c !== undefined),
    [cards],
  );

  // The "aha": credits resetting within a week, most urgent first.
  const slipping = useMemo(
    () =>
      selected
        .filter((c) => c.next.days <= 7)
        .sort((a, b) => a.next.days - b.next.days)
        .slice(0, 5),
    [selected],
  );
  const slippingSum = slipping.reduce((sum, c) => sum + c.next.amt, 0);
  const remindersOn = Object.values(notificationCategories).filter(Boolean).length;

  const summary = [
    { figure: `${selected.length}`, label: "cards added", accent: false },
    { figure: usd(creditsInPlay), label: "tracked per year", accent: true },
    { figure: `${remindersOn} of 4`, label: "reminders on", accent: false },
  ];

  return (
    <StepChrome
      step={4}
      title=""
      continueLabel="Enter OfferBee →"
      continueLoading={completing}
      continueDisabled={selected.length === 0}
      onContinue={() => void complete()}
    >
      {/* Reveal headline */}
      <View style={{ gap: 6 }}>
        <Text variant="sectionLabel" color="accent">
          You're all set
        </Text>
        <Text style={{ fontFamily: "SourceSerif4_600SemiBold", fontSize: 30, lineHeight: 36, color: colors.ink }}>
          {usd(slippingSum)} is about to slip away.
        </Text>
        <Text variant="subtext" color="secondary">
          {slipping.length} {slipping.length === 1 ? "credit" : "credits"} reset within a week
          across your wallet.
        </Text>
      </View>

      {slipping.length > 0 ? (
        <Card padded={false} style={{ marginTop: spacing.lg }}>
          {slipping.map((card, i) => (
            <View
              key={card.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingVertical: spacing.rowPadY,
                paddingHorizontal: spacing.rowPadX,
                borderBottomWidth: i < slipping.length - 1 ? 1 : 0,
                borderBottomColor: colors.separator,
              }}
            >
              <DaysTile days={card.next.days} urgent={card.next.days <= 3} />
              <CardArt cardKey={card.cardKey} color={card.color} width={30} height={20} borderRadius={4} />
              <View style={{ flex: 1 }}>
                <Text variant="body" numberOfLines={1}>
                  {card.next.name}
                </Text>
                <Text variant="subtext" color="secondary" numberOfLines={1} style={{ marginTop: 1 }}>
                  {card.name}
                </Text>
              </View>
              <Text variant="figureS" color="accent">
                {usd(card.next.amt)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Setup summary strip */}
      <View
        style={{
          marginTop: spacing.lg,
          flexDirection: "row",
          backgroundColor: colors.field,
          borderRadius: radius.card,
          paddingVertical: spacing.base,
          paddingHorizontal: spacing.sm,
        }}
      >
        {summary.map((col, i) => (
          <View
            key={col.label}
            style={{
              flex: 1,
              alignItems: "center",
              gap: 3,
              borderLeftWidth: i > 0 ? 1 : 0,
              borderLeftColor: colors.separator,
            }}
          >
            <Text variant="mono" style={{ fontSize: 16 }} color={col.accent ? "accent" : "ink"}>
              {col.figure}
            </Text>
            <Text variant="caption" color="tertiary">
              {col.label}
            </Text>
          </View>
        ))}
      </View>
    </StepChrome>
  );
}
