import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import { typography, type TypographyVariant } from "@/theme/typography";
import { useTheme } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/tokens";

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  /** Theme color role, or any literal color string. */
  color?: keyof ThemeColors | (string & {});
};

export function Text({ variant = "bodyRegular", color = "ink", style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const resolved = color in colors ? colors[color as keyof ThemeColors] : color;
  return <RNText style={[typography[variant], { color: resolved }, style]} {...rest} />;
}
