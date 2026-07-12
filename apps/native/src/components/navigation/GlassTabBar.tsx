import { useId, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  GlassEffectContainer,
  Host,
  HStack,
  Image,
  Namespace,
  Spacer,
  Text,
  VStack,
  ZStack,
} from "@expo/ui/swift-ui";
import {
  Animation,
  animation,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  glassEffectId,
  lineLimit,
  onTapGesture,
} from "@expo/ui/swift-ui/modifiers";
import type { SFSymbol } from "sf-symbols-typescript";

import { spacing } from "@/theme";

const TAB_META: Record<string, { label: string; icon: SFSymbol }> = {
  index: { label: "Review", icon: "house" },
  benefits: { label: "Benefits", icon: "checklist" },
  expiring: { label: "Expiring", icon: "clock" },
  cards: { label: "Cards", icon: "creditcard" },
};

const ACCENT = "#E8680E";
const MUTED = "#8A8A8E";
const BAR_HEIGHT = 58;
const PILL_INSET = 6; // margin between the selection capsule and the bar edges

// Structural types — expo-router vendors its own react-navigation copy, so the
// workspace BottomTabBarProps clashes nominally. Runtime shape is identical.
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

const metaFor = (name: string) =>
  TAB_META[name] ?? { label: name, icon: "circle" as SFSymbol };

/**
 * Floating tab bar rendered as real SwiftUI via `@expo/ui` (iOS 26 dev build
 * only). A ZStack layers a stable connected Liquid Glass bar behind the tabs; the
 * selected tab's glass highlight lives in a `GlassEffectContainer` with a shared
 * `glassEffectId`, so it does Apple's matched-geometry morph — the capsule slides
 * fluidly between tabs on selection (animated via the `animation` modifier), and
 * `interactive: true` gives the press reaction. Floating layout is ours
 * (RN-positioned `Host`); falls back to the RN `TabBar` off iOS 26.
 *
 * Each tab gets an explicit slot width measured from the bar (RN points ==
 * SwiftUI points), since `.frame(maxWidth: .infinity)` can't cross the JSON bridge.
 */
export function GlassTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const namespaceId = useId();
  const [barWidth, setBarWidth] = useState(0);
  const tabWidth = barWidth > 0 ? barWidth / state.routes.length : 0;

  const go = (index: number) => {
    const route = state.routes[index];
    const focused = state.index === index;
    Haptics.selectionAsync().catch(() => {});
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
  };

  return (
    <View
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      style={{
        position: "absolute",
        left: spacing.base,
        right: spacing.base,
        bottom: Math.max(insets.bottom, spacing.md),
        height: BAR_HEIGHT,
      }}
    >
      {tabWidth > 0 ? (
        <Host style={{ flex: 1 }}>
          <ZStack>
            {/* Stable connected glass bar behind everything. */}
            <HStack
              modifiers={[
                frame({ width: barWidth, height: BAR_HEIGHT }),
                glassEffect({ glass: { variant: "regular" }, shape: "capsule" }),
              ]}
            >
              <Spacer />
            </HStack>

            {/* Tabs + the morphing selection capsule (its own glass container). */}
            <Namespace id={namespaceId}>
              <GlassEffectContainer
                spacing={0}
                modifiers={[
                  animation(Animation.spring({ response: 0.32, dampingFraction: 0.8 }), state.index),
                ]}
              >
                <HStack spacing={0} modifiers={[frame({ width: barWidth, height: BAR_HEIGHT })]}>
                  {state.routes.map((route, index) => {
                    const meta = metaFor(route.name);
                    const focused = state.index === index;
                    return (
                      // Outer slot: full-width tap target (no Button — a Button
                      // swallows the touch before the interactive glass can warp).
                      <VStack
                        key={route.key}
                        modifiers={[
                          frame({ width: tabWidth, height: BAR_HEIGHT }),
                          onTapGesture(() => go(index)),
                        ]}
                      >
                        <VStack
                          spacing={3}
                          modifiers={[
                            frame({
                              width: tabWidth - PILL_INSET * 2,
                              height: BAR_HEIGHT - PILL_INSET * 2,
                            }),
                            ...(focused
                              ? [
                                  glassEffect({
                                    glass: { variant: "regular", interactive: true },
                                    shape: "capsule",
                                  }),
                                  glassEffectId("tab-selection", namespaceId),
                                ]
                              : []),
                          ]}
                        >
                          <Image systemName={meta.icon} size={22} color={focused ? ACCENT : MUTED} />
                          <Text
                            modifiers={[
                              font({ size: 11, weight: "medium" }),
                              lineLimit(1),
                              foregroundStyle(focused ? ACCENT : MUTED),
                            ]}
                          >
                            {meta.label}
                          </Text>
                        </VStack>
                      </VStack>
                    );
                  })}
                </HStack>
              </GlassEffectContainer>
            </Namespace>
          </ZStack>
        </Host>
      ) : null}
    </View>
  );
}
