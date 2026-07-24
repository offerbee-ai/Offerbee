import { Feather } from "@expo/vector-icons";

import { useTheme } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/tokens";

// Design iconography: outlined, 24 grid, 1.8 stroke, round caps.
// Feather is the closest cross-platform match; this abstraction keeps the
// app-level names stable if we swap to SF Symbols later.
const GLYPHS = {
  home: "home",
  benefits: "check-square",
  clock: "clock",
  card: "credit-card",
  search: "search",
  plus: "plus",
  close: "x",
  chevronRight: "chevron-right",
  chevronLeft: "chevron-left",
  chevronDown: "chevron-down",
  link: "link",
  ellipsis: "more-horizontal",
  bell: "bell",
  settings: "settings",
  sun: "sun",
  moon: "moon",
  check: "check",
  snooze: "moon",
  trash: "trash-2",
  external: "external-link",
  alert: "alert-circle",
  calendar: "calendar",
  smartphone: "smartphone",
  logout: "log-out",
  upload: "upload",
  sparkle: "star",
  sliders: "sliders",
  filter: "filter",
} as const;

export type IconName = keyof typeof GLYPHS;

export function Icon({
  name,
  size = 20,
  color = "ink",
}: {
  name: IconName;
  size?: number;
  color?: keyof ThemeColors | (string & {});
}) {
  const { colors } = useTheme();
  const resolved = color in colors ? colors[color as keyof ThemeColors] : color;
  return <Feather name={GLYPHS[name]} size={size} color={resolved} />;
}
