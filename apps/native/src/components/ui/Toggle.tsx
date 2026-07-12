import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/theme/ThemeProvider";

/** iOS-style switch: 44×26 track (accent on / track off), 20px white knob. */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onValueChange(!value);
      }}
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        padding: 3,
        justifyContent: "center",
        alignItems: value ? "flex-end" : "flex-start",
        backgroundColor: value ? colors.accent : colors.track,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: "#FFFFFF",
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.2,
          shadowRadius: 2,
          elevation: 2,
        }}
      />
    </Pressable>
  );
}
