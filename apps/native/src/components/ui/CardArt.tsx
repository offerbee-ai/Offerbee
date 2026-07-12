import { View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { cardBrandColors } from "@/theme/tokens";

type CardArtProps = {
  cardKey?: string;
  imageUrl?: string | null;
  /** Explicit brand color override (falls back to a stable hash of cardKey). */
  color?: string;
  width?: number;
  /** Height defaults to the ISO card aspect ratio. */
  height?: number;
  borderRadius?: number;
};

const FALLBACK_COLORS = ["#3A4048", "#B08A3E", "#1E6FB8", "#7A2E3B", "#2F4F43", "#4A3A5E"];

function fallbackColor(cardKey: string | undefined, explicit?: string): string {
  if (explicit) return explicit;
  if (!cardKey) return FALLBACK_COLORS[0];
  const known = cardBrandColors[cardKey];
  if (known) return known;
  let hash = 5381;
  for (let i = 0; i < cardKey.length; i++) hash = (hash * 33) ^ cardKey.charCodeAt(i);
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

/**
 * Card artwork: real image when the catalog has one, else the handoff's
 * brand-color plate — solid color + diagonal sheen + EMV chip.
 */
export function CardArt({
  cardKey,
  imageUrl,
  color,
  width = 48,
  height,
  borderRadius = 6,
}: CardArtProps) {
  const h = height ?? Math.round(width / 1.586);

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width, height: h, borderRadius }}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
      />
    );
  }

  const chipSize = Math.max(6, Math.round(width * 0.16));
  return (
    <View
      style={{
        width,
        height: h,
        borderRadius,
        backgroundColor: fallbackColor(cardKey, color),
        overflow: "hidden",
      }}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0.17)", "rgba(0,0,0,0.18)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1 }}
      />
      <View
        style={{
          position: "absolute",
          left: Math.round(width * 0.1),
          top: Math.round(h * 0.38),
          width: chipSize,
          height: Math.round(chipSize * 0.75),
          borderRadius: 2,
          backgroundColor: "rgba(255,255,255,0.55)",
        }}
      />
    </View>
  );
}
