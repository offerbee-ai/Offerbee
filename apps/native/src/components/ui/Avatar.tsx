import { Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { Text } from "./Text";

/**
 * Ask img.clerk.com for a display-sized render. Clerk's `user.imageUrl` defaults
 * to a small image that upscales blurry in a retina avatar box, and the host
 * honors a `width` query param — request ~3× the CSS size (capped). Uses string
 * ops rather than the URL API (no reliable URLSearchParams under Hermes); leaves
 * the URL untouched apart from the width param.
 */
function sizedImageUrl(url: string, size: number): string {
  const width = Math.min(size * 3, 512);
  const base = url.replace(/[?&]width=\d+/g, "").replace(/[?&]$/, "");
  return `${base}${base.includes("?") ? "&" : "?"}width=${width}`;
}

/**
 * Identity avatar. Shows the user's profile photo when they have one, otherwise
 * a brand gradient with their initial (gradient is fixed across themes, per the
 * design handoff).
 */
export function Avatar({
  initial,
  imageUrl,
  size = 36,
  onPress,
  accessibilityLabel,
}: {
  initial: string;
  imageUrl?: string | null;
  size?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const inner = imageUrl ? (
    <Image
      source={{ uri: sizedImageUrl(imageUrl, size) }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      transition={150}
      accessibilityIgnoresInvertColors
    />
  ) : (
    <LinearGradient
      colors={["#F5B14D", "#E8680E"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        color="#FFFFFF"
        style={{
          fontSize: Math.round(size * 0.42),
          lineHeight: Math.round(size * 0.5),
          fontFamily: "SourceSerif4_600SemiBold",
        }}
      >
        {initial.toUpperCase().slice(0, 1)}
      </Text>
    </LinearGradient>
  );

  if (!onPress) return inner;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {inner}
    </Pressable>
  );
}
