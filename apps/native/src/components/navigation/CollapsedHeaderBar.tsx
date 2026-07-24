import { Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";
import { spacing } from "@/theme";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Pinned compact bar that fades in as the large title scrolls away. Sits at the
 * top of the screen (content already starts inside the top safe area under
 * NativeTabs, so no manual inset here). `active` toggles hit-testing: when the
 * bar is invisible it must not steal taps from the large header beneath it.
 */
export function CollapsedHeaderBar({
  title,
  trailing,
  opacity,
  active,
}: {
  title: string;
  trailing?: React.ReactNode;
  opacity: Animated.AnimatedInterpolation<number>;
  active: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      pointerEvents={active ? "box-none" : "none"}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        opacity,
        paddingTop: insets.top,
        height: 48 + insets.top,
        paddingHorizontal: spacing.screenInset,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.separator,
      }}
    >
      <Text variant="title" numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </Text>
      {trailing ? (
        <View style={{ flexDirection: "row", gap: spacing.sm, marginLeft: spacing.md }}>{trailing}</View>
      ) : null}
    </Animated.View>
  );
}
