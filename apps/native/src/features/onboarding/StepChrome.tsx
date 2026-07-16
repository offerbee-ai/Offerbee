import { Pressable, ScrollView, View } from "react-native";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BeeLogo, Button, GlassSurface, Icon, Text } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { usd } from "@/features/credits/derive";
import { useOnboarding } from "./OnboardingProvider";

export const STEP_ROUTES = [
  "/(onboarding)/wallet",
  "/(onboarding)/spending",
  "/(onboarding)/reminders",
  "/(onboarding)/review",
] as const satisfies readonly Href[];

const STEP_LABELS = ["Wallet", "Spending", "Reminders", "Review"];

/**
 * Shared onboarding chrome: brand row + numbered-circle stepper header (tap a
 * completed step to jump back) + scrollable content + floating glass action
 * bar with the live "credits in play" counter.
 */
export function StepChrome({
  step, // 1-4
  title,
  subtitle,
  continueLabel = "Continue",
  continueDisabled = false,
  continueLoading = false,
  hideBar = false,
  onContinue,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueLoading?: boolean;
  /** Hide the floating action bar entirely (connect gate, design 1a). */
  hideBar?: boolean;
  /** Required on every step that shows the action bar (i.e. unless hideBar). */
  onContinue?: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { creditsInPlay } = useOnboarding();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.screenInset,
          paddingBottom: spacing.md,
          gap: spacing.base,
        }}
      >
        {/* Brand row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
            }}
          >
            <BeeLogo size={24} />
            <Text
              style={{
                fontFamily: "SourceSerif4_600SemiBold",
                fontSize: 17,
                color: colors.ink,
              }}
            >
              OfferBee
            </Text>
          </View>
          <Text
            variant="sectionLabel"
            style={{ fontSize: 11 }}
            color="tertiary"
          >
            Step {step} of 4
          </Text>
        </View>

        {/* Numbered circle stepper */}
        <View style={{ flexDirection: "row" }}>
          {STEP_LABELS.map((label, i) => {
            const idx = i + 1;
            const done = idx < step;
            const active = idx === step;
            return (
              <Pressable
                key={label}
                disabled={!done}
                onPress={() => router.replace(STEP_ROUTES[i])}
                style={{ flex: 1, alignItems: "center", gap: 6 }}
                accessibilityRole="button"
                accessibilityLabel={`Step ${idx}: ${label}`}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      done || active ? colors.accent : "transparent",
                    borderWidth: done || active ? 0 : 1.5,
                    borderColor: colors.border,
                  }}
                >
                  {done ? (
                    <Icon name="check" size={14} color="onAccent" />
                  ) : (
                    <Text
                      variant="mono"
                      style={{ fontSize: 12 }}
                      color={active ? "onAccent" : "tertiary"}
                    >
                      {idx}
                    </Text>
                  )}
                </View>
                <Text
                  variant="sectionLabel"
                  style={{ fontSize: 9.5, letterSpacing: 0.4 }}
                  color={active ? "accent" : done ? "secondary" : "tertiary"}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Title */}
        {title || subtitle ? (
          <View style={{ gap: 4 }}>
            {title ? <Text variant="title">{title}</Text> : null}
            {subtitle ? (
              <Text variant="subtext" color="secondary">
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Step content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.screenInset,
          // No floating bar → no scroll clearance to reserve for it.
          paddingBottom: (hideBar ? spacing.xl : 140) + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>

      {/* Floating glass action bar */}
      {hideBar ? null : (
        <GlassSurface
          variant="bar"
          borderRadius={radius.cardLg}
          style={{
            position: "absolute",
            left: spacing.base,
            right: spacing.base,
            bottom: Math.max(insets.bottom, spacing.md),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.base,
              paddingVertical: spacing.md,
              gap: spacing.md,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                variant="sectionLabel"
                style={{ fontSize: 9.5 }}
                color="tertiary"
              >
                Credits in play
              </Text>
              <Text variant="figureS" color="accent">
                {usd(creditsInPlay)}
                <Text variant="subtext" color="tertiary">
                  {" "}
                  / yr
                </Text>
              </Text>
            </View>
            {step > 1 ? (
              <Button
                label="Back"
                variant="ghost"
                size="sm"
                onPress={() => router.replace(STEP_ROUTES[step - 2])}
              />
            ) : null}
            <Button
              label={continueLabel}
              disabled={continueDisabled}
              loading={continueLoading}
              onPress={onContinue}
            />
          </View>
        </GlassSurface>
      )}
    </View>
  );
}
