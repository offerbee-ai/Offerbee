import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/theme";
import { Icon } from "./Icon";

/** 22px square checkbox in a 44px hit zone. Accent fill + check when on. */
export function Checkbox({
  value,
  onValueChange,
  accessibilityLabel,
  disabled,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={11}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onValueChange(!value);
      }}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: value ? colors.accent : colors.surface,
          borderWidth: value ? 0 : 1.5,
          borderColor: colors.circleEmpty,
        }}
      >
        {value ? <Icon name="check" size={14} color="onAccent" /> : null}
      </View>
    </Pressable>
  );
}
