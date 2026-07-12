import { View } from "react-native";

import { radius } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

type BadgeProps = {
  label: string;
  tone?: "accent" | "warning" | "alert" | "neutral";
};

/** Small status badge (radius 8): Keep / Review / Expiring / Used. */
export function Badge({ label, tone = "accent" }: BadgeProps) {
  const { colors } = useTheme();
  const palette = {
    accent: { bg: colors.accentSoft, text: colors.accentDeep },
    warning: { bg: colors.warningSoft, text: colors.warning },
    alert: { bg: colors.warningSoft, text: colors.alert },
    neutral: { bg: colors.field, text: colors.secondary },
  }[tone];

  return (
    <View
      style={{
        backgroundColor: palette.bg,
        borderRadius: radius.badge,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text variant="sectionLabel" style={{ fontSize: 10, letterSpacing: 0.5 }} color={palette.text}>
        {label}
      </Text>
    </View>
  );
}
