import { View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

type ProgressBarProps = {
  /** 0..1 */
  progress: number;
  height?: number;
  tone?: "accent" | "warning";
};

export function ProgressBar({ progress, height = 6, tone = "accent" }: ProgressBarProps) {
  const { colors } = useTheme();
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{
        height,
        borderRadius: height,
        backgroundColor: colors.track,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: "100%",
          borderRadius: height,
          backgroundColor: tone === "accent" ? colors.accent : colors.warning,
        }}
      />
    </View>
  );
}
