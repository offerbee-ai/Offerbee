// OfferBee "Ledger" design tokens — source of truth:
// Design/design_handoff_kept/tokens.json (v1.0.0, iOS 26 Liquid Glass).
// Two themes (Honey light, Onyx dark) over one fixed layout + type system.

export type ThemeName = "honey" | "onyx";

export type ThemeColors = {
  background: string;
  surface: string;
  border: string;
  separator: string;
  ink: string;
  secondary: string;
  tertiary: string;
  track: string;
  accent: string;
  accentSoft: string;
  /** Deep accent for text sitting on accentSoft pills. */
  accentDeep: string;
  onAccent: string;
  warning: string;
  warningSoft: string;
  alert: string;
  segmentedTrack: string;
  field: string;
  tabUnselected: string;
  glass: string;
  navButton: string;
};

export const themes: Record<ThemeName, ThemeColors> = {
  honey: {
    background: "#FBF8F0",
    surface: "#FFFEFB",
    border: "#E8E1D2",
    separator: "#ECE5D6",
    ink: "#211D16",
    secondary: "#6F6757",
    tertiary: "#9A927F",
    track: "#E4DECF",
    accent: "#E8680E",
    accentSoft: "#FBEAD5",
    accentDeep: "#B4550B",
    onAccent: "#FFFFFF",
    warning: "#B4693A",
    warningSoft: "#F6E9DF",
    alert: "#C0503F",
    segmentedTrack: "#E9E3D6",
    field: "#EDE7D9",
    tabUnselected: "#A69C86",
    glass: "rgba(251,248,240,0.60)",
    navButton: "rgba(255,254,251,0.75)",
  },
  onyx: {
    background: "#17181B",
    surface: "#212328",
    border: "#2E3036",
    separator: "#282A2F",
    ink: "#ECEBE6",
    secondary: "#9C9A93",
    tertiary: "#6E6C67",
    track: "#2E3036",
    accent: "#F59E3C",
    accentSoft: "#3A2C17",
    accentDeep: "#F5B36B",
    onAccent: "#17140E",
    warning: "#D18A4E",
    warningSoft: "#3A2E24",
    alert: "#E0785F",
    segmentedTrack: "#2A2C31",
    field: "#26282C",
    tabUnselected: "#6E6C67",
    glass: "rgba(22,23,26,0.62)",
    navButton: "rgba(255,255,255,0.08)",
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  screenInset: 16,
  rowPadY: 13,
  rowPadX: 16,
} as const;

export const radius = {
  badge: 8,
  chip: 11,
  button: 11,
  card: 16,
  cardLg: 18,
  tabBar: 30,
  pill: 9999,
} as const;

export const glass = {
  /** Native blur fallback intensity (expo-blur) approximating blur(22px) saturate(180%). */
  blurIntensity: 40,
  opacity: 0.6,
} as const;

// Card-brand colors are CONTENT, not theme tokens — they never remap per theme.
export const cardBrandColors: Record<string, string> = {
  "amex-platinum": "#3A4048",
  "amex-gold": "#B08A3E",
  "sapphire-reserve": "#1E6FB8",
  "hilton-aspire": "#7A2E3B",
};

/** Space reserved at the bottom of tab screens so content scrolls clear of the floating tab bar. */
export const TAB_BAR_CLEARANCE = 98;
