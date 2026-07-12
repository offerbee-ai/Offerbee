import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";

import { glass } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

export type GlassSurfaceProps = ViewProps & {
  /** bar = floating tab/action bars (strong shadow); panel = sheets/headers (soft). */
  variant?: "bar" | "panel";
  borderRadius?: number;
  isInteractive?: boolean;
};

const liquidGlass = isLiquidGlassAvailable();

// One glass abstraction for the whole app:
// iOS 26+  → native Liquid Glass (expo-glass-effect)
// older iOS / Android → BlurView approximating blur(22px) saturate(180%)
// anything else → translucent surface fallback.
export function GlassSurface({
  variant = "bar",
  borderRadius = 30,
  isInteractive,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const { colors, isDark } = useTheme();

  const shadow =
    variant === "bar"
      ? {
          shadowColor: isDark ? "#000000" : "#211D16",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.4 : 0.16,
          shadowRadius: 30,
          elevation: 12,
        }
      : {
          shadowColor: isDark ? "#000000" : "#211D16",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.3 : 0.1,
          shadowRadius: 18,
          elevation: 8,
        };

  if (liquidGlass) {
    // The native Liquid Glass layer composites *above* sibling RN views on
    // iOS 26 (zIndex can't beat it), so children must render INSIDE GlassView.
    // GlassView is a normal-flow child that sizes to its content — callers
    // relying on content height (onboarding bar) work, and callers that want a
    // fixed bar give their content an explicit height. Content must NOT use
    // flex:1 here: with no definite parent height that collapses to 0.
    return (
      <View style={[shadow, { borderRadius }, style]} {...rest}>
        <GlassView
          isInteractive={isInteractive}
          style={{ borderRadius, overflow: "hidden" }}
        >
          {children}
        </GlassView>
      </View>
    );
  }

  if (Platform.OS === "ios" || Platform.OS === "android") {
    return (
      <View style={[shadow, { borderRadius }, style]} {...rest}>
        <View
          style={{
            borderRadius,
            overflow: "hidden",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
          }}
        >
          <BlurView
            intensity={glass.blurIntensity}
            tint={isDark ? "dark" : "light"}
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
          {children}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        shadow,
        {
          borderRadius,
          backgroundColor: colors.glass,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
