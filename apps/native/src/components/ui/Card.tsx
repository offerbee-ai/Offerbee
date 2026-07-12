import { View, type ViewProps } from "react-native";

import { radius, spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

type CardProps = ViewProps & {
  size?: "md" | "lg";
  padded?: boolean;
};

// Inset-grouped surface: 1px border ring + soft elevation, per handoff
// (card shadow 0 1px 2px …05, 0 10px 28px …06).
export function Card({ size = "md", padded = true, style, ...rest }: CardProps) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: size === "lg" ? radius.cardLg : radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: isDark ? "#000000" : "#211D16",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.25 : 0.06,
          shadowRadius: 14,
          elevation: 3,
          ...(padded ? { padding: spacing.base } : {}),
        },
        style,
      ]}
      {...rest}
    />
  );
}
