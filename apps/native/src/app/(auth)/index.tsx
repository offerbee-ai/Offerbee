import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BeeLogo, Button, Text } from "@/components/ui";
import { spacing, useTheme } from "@/theme";
import { fontFamilies } from "@/theme/typography";

const CARD_W = 150;
const CARD_H = 94;

/** Fan of 3 solid brand-color cards: ∓9° behind a flat centered card. */
function fanCard(
  color: string,
  translateX: number,
  rotate: string,
  top: number,
  z: number,
  children?: React.ReactNode,
) {
  return (
    <View
      style={{
        position: "absolute",
        top,
        left: "50%",
        marginLeft: -CARD_W / 2,
        width: CARD_W,
        height: CARD_H,
        borderRadius: 12,
        backgroundColor: color,
        transform: [{ translateX }, { rotate }],
        zIndex: z,
        padding: 13,
        justifyContent: "space-between",
        shadowColor: "#211D16",
        shadowOffset: { width: 0, height: z > 1 ? 14 : 10 },
        shadowOpacity: z > 1 ? 0.24 : 0.18,
        shadowRadius: z > 1 ? 24 : 20,
      }}
    >
      {children}
    </View>
  );
}

function CardFan() {
  return (
    <View style={{ height: 130, width: 290, alignSelf: "center" }}>
      {fanCard("#127C6B", -58, "-9deg", 14, 1)}
      {fanCard("#B08A3E", 58, "9deg", 14, 1)}
      {fanCard("#3A4048", 0, "0deg", 4, 2,
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: fontFamilies.display, fontSize: 10, letterSpacing: 0.8, color: "#E9ECEF" }}>
              PLATINUM
            </Text>
            <View style={{ width: 22, height: 16, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.4)" }} />
          </View>
          <Text style={{ fontFamily: fontFamilies.mono, fontSize: 10, letterSpacing: 1.2, color: "#B4BBC2" }}>
            •••• 2004
          </Text>
        </>,
      )}
    </View>
  );
}

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingHorizontal: spacing.xl,
        paddingTop: insets.top + spacing.xl,
        paddingBottom: insets.bottom + spacing.xl,
      }}
    >
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg }}>
        <CardFan />

        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg }}>
          <BeeLogo size={38} />
          <Text style={{ fontFamily: fontFamilies.display, fontSize: 28, lineHeight: 36, letterSpacing: -0.3 }}>
            OfferBee
          </Text>
        </View>

        <Text
          style={{ fontFamily: fontFamilies.display, fontSize: 33, lineHeight: 38, textAlign: "center" }}
        >
          {"Every credit.\nKept."}
        </Text>
        <Text variant="bodyRegular" color="secondary" style={{ textAlign: "center", maxWidth: 300 }}>
          Track every premium-card statement credit — what's left, what's about to reset, and whether
          each annual fee earns its keep.
        </Text>
      </View>

      <View style={{ gap: spacing.md }}>
        <Button label="Get started" onPress={() => router.push("/sign-up")} />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/sign-in")}
          hitSlop={8}
          style={({ pressed }) => ({ paddingVertical: spacing.sm, opacity: pressed ? 0.6 : 1 })}
        >
          <Text variant="button" color="accent" style={{ textAlign: "center" }}>
            I already have an account
          </Text>
        </Pressable>
        <Text
          variant="sectionLabel"
          color="tertiary"
          style={{ textAlign: "center", fontSize: 10, letterSpacing: 0.7 }}
        >
          Read-only bank link · Every credit tracked
        </Text>
      </View>
    </View>
  );
}
