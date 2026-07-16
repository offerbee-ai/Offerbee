import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@packages/backend/convex/_generated/api";

import { Button, Icon, Screen, Skeleton, Text } from "@/components/ui";
import { fontFamilies, radius, spacing, useTheme } from "@/theme";
import {
  isPlaidAvailable,
  usePlaidCardLink,
  type DetectResult,
} from "@/features/plaid/usePlaidCardLink";
import { DetectedCardsReview } from "@/features/plaid/DetectedCardsReview";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { StepChrome } from "@/features/onboarding/StepChrome";

// Onboarding step 1 as a Plaid-first gate (design 1a/1c) — native port of the
// web StepConnect. Connect is the whole step; the curated manual picker
// (wallet.tsx) sits behind the skip link and is the automatic fallback on any
// Plaid failure. Expo Go / unconfigured deployments never see the gate —
// they're routed straight to the manual picker since Connect can't work there.

// The manual fallback, optionally carrying a fixed fallback banner (design
// state 1c): "1" = couldn't connect, "2" = no credit cards found. Copy lives
// in wallet.tsx.
const toManual = (notice?: "1" | "2") =>
  notice
    ? router.replace({
        pathname: "/(onboarding)/wallet",
        params: { notice },
      })
    : router.replace("/(onboarding)/wallet");

export default function OnboardingConnect() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { setStep } = useOnboarding();
  const configured = useQuery(api.plaid.plaidConfigured);
  const [result, setResult] = useState<DetectResult | null>(null);

  // Gate and wallet are both step 1 — same stepper position.
  useEffect(() => setStep(2), [setStep]);

  const { startConnect, busy } = usePlaidCardLink({
    onDetected: (r) => {
      if (r.accounts.length === 0) {
        // Nothing trackable detected — fall back to manual with the
        // empty-detection notice so the switch is never silent (rule #1).
        toManual("2");
        return;
      }
      setResult(r);
    },
    onFail: (reason, message) => {
      if (reason === "error") {
        // Raw Plaid/backend messages aren't user-appropriate — log them for
        // debugging and fall back to manual with the fixed copy (state 1c).
        if (message) console.error("Plaid connect failed:", message);
        toManual("1");
      }
      // "exit": user closed Link on purpose — stay on the gate.
    },
  });

  const skipGate = !isPlaidAvailable || configured === false;
  useEffect(() => {
    if (skipGate) toManual();
  }, [skipGate]);

  // Post-connect review — rendered OUTSIDE StepChrome: its Continue bar
  // would be a parallel affordance that skips confirm (nothing is added
  // without the user). Fixed (non-scrolling) Screen because
  // DetectedCardsReview owns its scroll region via its internal ScrollView —
  // same composition as add-card.tsx. spending.tsx sets step 2 on mount, so
  // a plain replace is enough.
  if (result) {
    return (
      <Screen
        fixed
        style={{
          paddingTop: insets.top + spacing.lg,
          // "Skip for now" must clear the home indicator.
          paddingBottom: Math.max(insets.bottom, spacing.xl),
        }}
      >
        <DetectedCardsReview
          result={result}
          onDone={() => router.replace("/(onboarding)/spending")}
        />
      </Screen>
    );
  }

  // Effect above is redirecting; render nothing in the meantime.
  if (skipGate) return null;

  // Action bar hidden on this step (design 1a) — the card's skip link is the
  // only manual affordance; the gate never advances past step 1 by itself.
  return (
    <StepChrome
      step={2}
      title="Connect your bank"
      subtitle="We'll find your cards and track their credits automatically."
      hideBar
    >
      {configured === undefined ? (
        <Skeleton height={320} borderRadius={radius.cardLg} />
      ) : (
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.cardLg,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.xl + spacing.sm,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="link" size={22} color="accent" />
          </View>
          <Text
            style={{
              fontFamily: fontFamilies.display,
              fontSize: 21,
              color: colors.ink,
              textAlign: "center",
              marginTop: spacing.base,
            }}
          >
            Find my cards for me
          </Text>
          <Text
            variant="bodyRegular"
            color="secondary"
            style={{ textAlign: "center", marginTop: spacing.sm }}
          >
            Connect once — OfferBee detects your credit cards and tracks their
            credits from transactions.
          </Text>
          <View style={{ alignSelf: "stretch", marginTop: spacing.lg }}>
            <Button
              label={busy ? "Connecting…" : "Connect with Plaid"}
              disabled={busy}
              onPress={() => void startConnect()}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => toManual()}
            hitSlop={8}
            style={{ marginTop: spacing.base }}
          >
            <Text
              variant="subtext"
              color="secondary"
              style={{ textDecorationLine: "underline" }}
            >
              I&apos;ll add my cards manually →
            </Text>
          </Pressable>
          <Text
            variant="sectionLabel"
            color="tertiary"
            style={{ marginTop: spacing.base, textAlign: "center" }}
          >
            Read-only access · Disconnect anytime
          </Text>
        </View>
      )}
    </StepChrome>
  );
}
