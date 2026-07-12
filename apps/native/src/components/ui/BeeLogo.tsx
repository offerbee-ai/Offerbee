import { View } from "react-native";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

/**
 * OfferBee brand mark — the minimal amber bee tile.
 * Ported from logos/offerbee-concept-3-minimal-bee.svg (viewBox 512).
 */
export function BeeLogo({ size = 38 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id="amber" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFB300" />
          <Stop offset="1" stopColor="#FF6D00" />
        </LinearGradient>
        <ClipPath id="beebody">
          <Rect x="146" y="216" width="240" height="140" rx="70" />
        </ClipPath>
      </Defs>
      <Rect width="512" height="512" rx="116" fill="url(#amber)" />
      <Ellipse cx="226" cy="164" rx="46" ry="72" rotation={-24} originX="226" originY="164" fill="#FFFFFF" opacity={0.55} />
      <Ellipse cx="306" cy="164" rx="46" ry="72" rotation={24} originX="306" originY="164" fill="#FFFFFF" opacity={0.85} />
      <Path
        d="M360 270 Q404 278 412 286 Q404 294 360 302 Z"
        fill="#FFFFFF"
        stroke="#FFFFFF"
        strokeWidth={8}
        strokeLinejoin="round"
      />
      <Rect x="146" y="216" width="240" height="140" rx="70" fill="#FFFFFF" />
      <G clipPath="url(#beebody)">
        <Rect x="236" y="200" width="30" height="180" fill="#FF6D00" opacity={0.9} />
        <Rect x="296" y="200" width="30" height="180" fill="#FF6D00" opacity={0.9} />
      </G>
      <Circle cx="196" cy="272" r="13" fill="#FF6D00" />
      <Path d="M172 222 Q160 184 132 172" fill="none" stroke="#FFFFFF" strokeWidth={10} strokeLinecap="round" />
      <Circle cx="128" cy="170" r="10" fill="#FFFFFF" />
    </Svg>
    </View>
  );
}
