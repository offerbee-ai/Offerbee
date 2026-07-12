import { TextInput, View, type TextInputProps } from "react-native";

import { radius, spacing } from "@/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "./Icon";

export function SearchField({ style, ...rest }: TextInputProps) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        backgroundColor: colors.field,
        borderRadius: radius.chip,
        paddingHorizontal: spacing.md,
        height: 40,
      }}
    >
      <Icon name="search" size={16} color="tertiary" />
      <TextInput
        placeholderTextColor={colors.tertiary}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={[
          {
            flex: 1,
            fontFamily: fontFamilies.text,
            fontSize: 15,
            color: colors.ink,
            paddingVertical: 0,
          },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}
