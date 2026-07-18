import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/theme";
import { Icon } from "./Icon";

/** 28px claim toggle inside a 44px hit zone. Empty = tap to claim; filled = undo. */
export function CircleCheck({
  claimed,
  onPress,
  disabled,
}: {
  claimed: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={claimed ? "Claimed, tap to undo" : "Mark claimed"}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: claimed ? colors.accent : colors.surface,
          borderWidth: claimed ? 0 : 2,
          borderColor: colors.circleEmpty,
        }}
      >
        {claimed ? <Icon name="check" size={16} color="onAccent" /> : null}
      </View>
    </Pressable>
  );
}
