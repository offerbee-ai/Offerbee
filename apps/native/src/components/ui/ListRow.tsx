import { Pressable, View, type ViewProps } from "react-native";

import { spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

type ListRowProps = ViewProps & {
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  /** Hairline separator below the row (skip on the last row of a group). */
  separator?: boolean;
};

/** Inset-grouped list row: rowPad 13×16, hairline separators. */
export function ListRow({ left, right, onPress, separator = true, children, style, ...rest }: ListRowProps) {
  const { colors } = useTheme();

  const body = (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingVertical: spacing.rowPadY,
          paddingHorizontal: spacing.rowPadX,
        },
        style,
      ]}
      {...rest}
    >
      {left}
      <View style={{ flex: 1 }}>{children}</View>
      {right}
    </View>
  );

  return (
    <View>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {separator ? (
        <View
          style={{
            height: 1,
            backgroundColor: colors.separator,
            marginLeft: spacing.rowPadX,
          }}
        />
      ) : null}
    </View>
  );
}
