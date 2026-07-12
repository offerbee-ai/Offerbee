import { useState } from "react";
import { LayoutAnimation, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

type SegmentedControlProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** iOS-style segmented control on the theme's segmentedTrack, surface thumb. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const { colors, isDark } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segmentWidth = width > 0 ? (width - 4) / options.length : 0;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: "row",
        backgroundColor: colors.segmentedTrack,
        borderRadius: 11,
        padding: 2,
        height: 36,
      }}
    >
      {segmentWidth > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 2,
            left: 2 + index * segmentWidth,
            width: segmentWidth,
            height: 32,
            borderRadius: 9,
            backgroundColor: colors.surface,
            shadowColor: isDark ? "#000000" : "#211D16",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.3 : 0.08,
            shadowRadius: 6,
            elevation: 2,
          }}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              Haptics.selectionAsync().catch(() => {});
              onChange(option.value);
            }}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text
              variant="button"
              style={{ fontSize: 13 }}
              color={selected ? "ink" : "secondary"}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
