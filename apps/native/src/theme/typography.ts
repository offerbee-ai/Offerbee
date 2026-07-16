import type { TextStyle } from "react-native";

// Ledger type system: Source Serif 4 (display), Public Sans (text),
// IBM Plex Mono (every number + uppercase section labels, tabular).
export const fontFamilies = {
  display: "SourceSerif4_600SemiBold",
  text: "PublicSans_400Regular",
  textMedium: "PublicSans_500Medium",
  textSemiBold: "PublicSans_600SemiBold",
  textBold: "PublicSans_700Bold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
  monoSemiBold: "IBMPlexMono_600SemiBold",
} as const;

const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

// Letter spacing is px (RN), converted from the em values in tokens.json.
export const typography = {
  largeTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 34,
    letterSpacing: -0.68,
    lineHeight: 40,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 24,
    letterSpacing: -0.24,
    lineHeight: 30,
  },
  figureL: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 40,
    letterSpacing: -1.2,
    lineHeight: 46,
    ...tabular,
  },
  figureM: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 30,
    lineHeight: 36,
    ...tabular,
  },
  figureS: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 17,
    lineHeight: 22,
    ...tabular,
  },
  sectionLabel: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 11,
    letterSpacing: 0.66,
    lineHeight: 14,
    textTransform: "uppercase",
    ...tabular,
  },
  mono: {
    fontFamily: fontFamilies.mono,
    fontSize: 13,
    lineHeight: 18,
    ...tabular,
  },
  body: {
    fontFamily: fontFamilies.textSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  bodyRegular: {
    fontFamily: fontFamilies.text,
    fontSize: 15,
    lineHeight: 20,
  },
  subtext: {
    fontFamily: fontFamilies.text,
    fontSize: 12.5,
    lineHeight: 17,
  },
  button: {
    fontFamily: fontFamilies.textSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  caption: {
    fontFamily: fontFamilies.text,
    fontSize: 12,
    lineHeight: 16,
  },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
