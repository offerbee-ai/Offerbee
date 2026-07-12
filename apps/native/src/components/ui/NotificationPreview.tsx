import { View } from "react-native";

import { spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";
import { BeeLogo } from "./BeeLogo";

/**
 * iOS-notification-style banner card. Reused by the reminders step and the
 * notification primer to preview exactly what a nudge looks like.
 */
export function NotificationPreview({
  title,
  body,
  dimmed = false,
}: {
  title: string;
  body: string;
  dimmed?: boolean;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        opacity: dimmed ? 0.35 : 1,
        shadowColor: isDark ? "#000000" : "#211D16",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: isDark ? 0.25 : 0.08,
        shadowRadius: 14,
        elevation: 3,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <BeeLogo size={30} />
        <Text variant="sectionLabel" style={{ fontSize: 10, flex: 1 }} color="tertiary">
          OfferBee
        </Text>
        <Text variant="caption" color="tertiary">
          now
        </Text>
      </View>
      <Text variant="body" style={{ marginTop: spacing.sm }}>
        {title}
      </Text>
      <Text variant="subtext" color="secondary" style={{ marginTop: 2 }}>
        {body}
      </Text>
    </View>
  );
}
