import { View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";

import { Button, Icon, NotificationPreview, Text } from "@/components/ui";
import { spacing, useTheme } from "@/theme";

/**
 * Notification-permission primer (design 07) — an interstitial after the
 * reminders step and before the OS permission dialog. Standalone (no stepper).
 */
export default function OnboardingPrimer() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const proceed = () => router.replace("/(onboarding)/review");

  const enable = async () => {
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // Expo Go / simulator can reject; proceed regardless.
    }
    proceed();
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
        paddingBottom: Math.max(insets.bottom, spacing.lg),
      }}
    >
      <View
        style={{
          flex: 1,
          paddingHorizontal: spacing.xl,
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.base,
        }}
      >
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="bell" size={34} color="accent" />
        </View>
        <Text
          style={{
            fontFamily: "SourceSerif4_600SemiBold",
            fontSize: 28,
            lineHeight: 34,
            textAlign: "center",
            color: colors.ink,
          }}
        >
          Never miss a reset
        </Text>
        <Text variant="bodyRegular" color="secondary" style={{ textAlign: "center", maxWidth: 300 }}>
          One nudge, a day or two before a credit resets — only when real money is about to expire.
        </Text>
        <View style={{ alignSelf: "stretch", marginTop: spacing.sm }}>
          <NotificationPreview
            title="Dining credit resets in 2 days"
            body="Use your $10 Amex Gold credit before it disappears."
          />
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
        <Button label="Turn on notifications" onPress={enable} />
        <Button label="Not now" variant="ghost" onPress={proceed} />
        <Text
          variant="sectionLabel"
          color="tertiary"
          style={{ fontSize: 10, textAlign: "center", marginTop: spacing.xs }}
        >
          Change anytime in settings
        </Text>
      </View>
    </View>
  );
}
