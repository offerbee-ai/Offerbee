import { useEffect, useRef, useState } from "react";
import { Animated, ScrollView, View, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "expo-router";

import { spacing, TAB_BAR_CLEARANCE } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { ScreenHeader } from "@/components/navigation/ScreenHeader";
import { CollapsedHeaderBar } from "@/components/navigation/CollapsedHeaderBar";

/** Large title + actions that collapse into a pinned compact bar on scroll. */
export type ScreenHeaderConfig = {
  title: string;
  kicker?: string;
  trailing?: React.ReactNode;
};

type ScreenProps = ScrollViewProps & {
  /** Reserve space for the floating glass tab bar (tab screens only). */
  withTabBarClearance?: boolean;
  /** Static (non-scrolling) screen. */
  fixed?: boolean;
  /** Collapsing large-title header pinned to the top on scroll. */
  header?: ScreenHeaderConfig;
};

// Scroll distance (px) over which the large title hands off to the pinned bar.
const COLLAPSE_DISTANCE = 56;

export function Screen({
  withTabBarClearance = false,
  fixed = false,
  header,
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

  if (header) {
    return (
      <CollapsingHeaderScreen
        header={header}
        bottomPad={bottomPad}
        style={style}
        contentContainerStyle={contentContainerStyle}
        rest={rest}
      >
        {children}
      </CollapsingHeaderScreen>
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

/** Scroll surface whose large title collapses into a pinned compact bar. */
function CollapsingHeaderScreen({
  header,
  bottomPad,
  style,
  contentContainerStyle,
  rest,
  children,
}: {
  header: ScreenHeaderConfig;
  bottomPad: number;
  style: ScrollViewProps["style"];
  contentContainerStyle: ScrollViewProps["contentContainerStyle"];
  rest: ScrollViewProps;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [collapsed, setCollapsed] = useState(false);
  const navigation = useNavigation();

  // Re-tapping the active tab scrolls this screen back to the top (native iOS
  // behavior, which the wrapping View otherwise defeats for NativeTabs). Wired
  // via expo-router's own navigation object so the context matches — importing
  // useScrollToTop from @react-navigation/native reads a duplicate route
  // context and throws "Couldn't find a route object".
  useEffect(() => {
    const nav = navigation as unknown as {
      addListener: (event: string, cb: () => void) => () => void;
      isFocused: () => boolean;
    };
    return nav.addListener("tabPress", () => {
      if (!nav.isFocused()) return;
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    });
  }, [navigation]);

  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const next = value > COLLAPSE_DISTANCE * 0.5;
      setCollapsed((prev) => (prev === next ? prev : next));
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);

  const barOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE * 0.4, COLLAPSE_DISTANCE],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Animated.ScrollView
        ref={scrollRef}
        style={[{ flex: 1 }, style]}
        contentContainerStyle={[
          { paddingHorizontal: spacing.screenInset, paddingBottom: bottomPad },
          contentContainerStyle,
        ]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        {...rest}
      >
        <ScreenHeader title={header.title} kicker={header.kicker} trailing={header.trailing} />
        {children}
      </Animated.ScrollView>
      <CollapsedHeaderBar
        title={header.title}
        trailing={header.trailing}
        opacity={barOpacity}
        active={collapsed}
      />
    </View>
  );
}
