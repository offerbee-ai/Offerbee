import { ScrollView, View, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing, TAB_BAR_CLEARANCE } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

type ScreenProps = ScrollViewProps & {
  /** Reserve space for the floating glass tab bar (tab screens only). */
  withTabBarClearance?: boolean;
  /** Static (non-scrolling) screen. */
  fixed?: boolean;
};

export function Screen({
  withTabBarClearance = false,
  fixed = false,
  style,
  contentContainerStyle,
  children,
  ...rest
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = withTabBarClearance ? TAB_BAR_CLEARANCE + insets.bottom : spacing.xl;

  if (fixed) {
    return (
      <View
        style={[
          {
            flex: 1,
            backgroundColor: colors.background,
            paddingHorizontal: spacing.screenInset,
            paddingBottom: bottomPad,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: colors.background }, style]}
      contentContainerStyle={[
        { paddingHorizontal: spacing.screenInset, paddingBottom: bottomPad },
        contentContainerStyle,
      ]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
