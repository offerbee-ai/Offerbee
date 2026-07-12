import { Pressable } from "react-native";
import * as Haptics from "expo-haptics";

import { radius, spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";
import { Icon, type IconName } from "./Icon";

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
};

/** Selectable filter/category chip (radius 11, field bg → accentSoft when selected). */
export function Chip({ label, selected = false, onPress, icon }: ChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: spacing.md,
        height: 34,
        borderRadius: radius.chip,
        backgroundColor: selected ? colors.accentSoft : colors.field,
        borderWidth: 1,
        borderColor: selected ? colors.accent : "transparent",
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? (
        <Icon name={icon} size={14} color={selected ? "accentDeep" : "secondary"} />
      ) : null}
      <Text variant="button" style={{ fontSize: 13 }} color={selected ? "accentDeep" : "secondary"}>
        {label}
      </Text>
    </Pressable>
  );
}
