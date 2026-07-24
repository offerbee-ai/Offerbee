import { ActivityIndicator, Pressable, type PressableProps, View } from "react-native";
import * as Haptics from "expo-haptics";

import { radius, spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";
import { Icon, type IconName } from "./Icon";

type ButtonProps = Omit<PressableProps, "children"> & {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "md" | "sm";
  icon?: IconName;
  loading?: boolean;
  haptic?: boolean;
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  haptic = true,
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const { colors, isDark } = useTheme();

  const palette = {
    primary: {
      bg: colors.accent,
      text: colors.onAccent,
      border: "transparent",
    },
    secondary: {
      bg: colors.surface,
      text: colors.ink,
      border: colors.border,
    },
    ghost: {
      bg: "transparent",
      text: colors.accent,
      border: "transparent",
    },
    destructive: {
      bg: "transparent",
      text: colors.alert,
      border: colors.border,
    },
  }[variant];

  const height = size === "md" ? 48 : 34;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={(e) => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        {
          height,
          borderRadius: radius.button,
          backgroundColor: palette.bg,
          borderWidth: palette.border === "transparent" ? 0 : 1,
          borderColor: palette.border,
          paddingHorizontal: size === "md" ? spacing.lg : spacing.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          ...(variant === "primary" && !disabled
            ? {
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: isDark ? 0.35 : 0.22,
                shadowRadius: 16,
                elevation: 6,
              }
            : {}),
        },
        typeof style === "function" ? undefined : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.text} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === "md" ? 18 : 15} color={palette.text} /> : null}
          <Text variant="button" color={palette.text} style={size === "sm" ? { fontSize: 13 } : undefined}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Small pill action, e.g. "Use" / "Snooze" / "Mark used" row buttons. */
export function PillButton({
  label,
  tone = "accent",
  onPress,
  disabled,
}: {
  label: string;
  tone?: "accent" | "soft" | "neutral";
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const palette = {
    accent: { bg: colors.accent, text: colors.onAccent, border: "transparent" },
    soft: { bg: colors.accentSoft, text: colors.accentDeep, border: "transparent" },
    neutral: { bg: colors.surface, text: colors.secondary, border: colors.border },
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        height: 28,
        borderRadius: 9999,
        backgroundColor: palette.bg,
        borderWidth: palette.border === "transparent" ? 0 : 1,
        borderColor: palette.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      <Text variant="button" color={palette.text} style={{ fontSize: 12.5 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Round icon-only button (nav bar “+”, close, ellipsis). */
export function IconButton({
  icon,
  size = 36,
  onPress,
  accessibilityLabel,
  tint = "ink",
  badge,
}: {
  icon: IconName;
  size?: number;
  onPress?: () => void;
  accessibilityLabel: string;
  /** Icon glyph color role (default "ink"; the Review header uses "accent"). */
  tint?: string;
  /** Unread count; renders an alert pill when > 0, hidden otherwise. */
  badge?: number;
}) {
  const { colors } = useTheme();
  const showBadge = typeof badge === "number" && badge > 0;
  const badgeLabel = badge && badge > 9 ? "9+" : String(badge ?? "");
  return (
    <View style={{ position: "relative" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress?.();
        }}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.navButton,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Icon name={icon} size={Math.round(size * 0.5)} color={tint} />
      </Pressable>
      {showBadge ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: colors.alert,
            borderWidth: 1.5,
            borderColor: colors.background,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text variant="mono" color="onAccent" style={{ fontSize: 10, lineHeight: 12 }}>
            {badgeLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
