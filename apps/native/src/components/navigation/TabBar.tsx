import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { GlassSurface, Icon, Text, type IconName } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";

const TAB_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: "Review", icon: "home" },
  benefits: { label: "Benefits", icon: "benefits" },
  expiring: { label: "Expiring", icon: "clock" },
  cards: { label: "Cards", icon: "card" },
};

const BAR_HEIGHT = 64;
const PILL_INSET = 6; // horizontal gap between the pill and its tab slot edges

// Structural types for the pieces we render — expo-router vendors its own
// react-navigation copy, so importing BottomTabBarProps from the workspace copy
// causes nominal type clashes. Runtime shape is identical.
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (event: {
      type: "tabPress";
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
};

/** Floating Liquid-Glass tab bar (radius 30, inset from screen edges). */
export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const tabCount = state.routes.length;
  const [barWidth, setBarWidth] = useState(0);
  const tabWidth = barWidth / tabCount;

  // Slide the selection pill to the active tab.
  const slide = useRef(new Animated.Value(state.index)).current;
  useEffect(() => {
    Animated.spring(slide, {
      toValue: state.index,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
      mass: 0.7,
    }).start();
  }, [state.index, slide]);

  return (
    <GlassSurface
      variant="bar"
      borderRadius={radius.tabBar}
      style={{
        position: "absolute",
        left: spacing.base,
        right: spacing.base,
        bottom: Math.max(insets.bottom, spacing.md),
        height: BAR_HEIGHT,
      }}
    >
      <View
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        style={{ flexDirection: "row", height: BAR_HEIGHT, alignSelf: "stretch" }}
      >
        {/* Floating frosted selection pill behind the active tab. */}
        {tabWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: (BAR_HEIGHT - 52) / 2,
              left: PILL_INSET,
              width: tabWidth - PILL_INSET * 2,
              height: 52,
              borderRadius: 20,
              backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.7)",
              borderWidth: 1,
              borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.85)",
              shadowColor: isDark ? "#000000" : "#211D16",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.35 : 0.12,
              shadowRadius: 8,
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, tabWidth],
                  }),
                },
              ],
            }}
          />
        ) : null}

        {state.routes.map((route, index) => {
          const meta = TAB_META[route.name] ?? { label: route.name, icon: "home" as IconName };
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }}
            >
              <Icon name={meta.icon} size={21} color={focused ? "accent" : "tabUnselected"} />
              <Text
                variant="caption"
                style={{ fontSize: 10 }}
                color={focused ? "accent" : "tabUnselected"}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </GlassSurface>
  );
}
