import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Text } from "./Text";

/**
 * Gradient identity avatar with a white initial. The gradient is brand content
 * (fixed across themes), per the design handoff.
 */
export function Avatar({
  initial,
  size = 36,
  onPress,
  accessibilityLabel,
}: {
  initial: string;
  size?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const inner = (
    <LinearGradient
      colors={["#F5B14D", "#E8680E"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        color="#FFFFFF"
        style={{
          fontSize: Math.round(size * 0.42),
          lineHeight: Math.round(size * 0.5),
          fontFamily: "SourceSerif4_600SemiBold",
        }}
      >
        {initial.toUpperCase().slice(0, 1)}
      </Text>
    </LinearGradient>
  );

  if (!onPress) return inner;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {inner}
    </Pressable>
  );
}
