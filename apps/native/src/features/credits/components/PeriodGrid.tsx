import { Alert, Platform, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";

import { Text } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { usd, type PeriodCell } from "../derive";

/**
 * Per-period grid for a credit (this calendar year). Annual → a single checkbox
 * cell; quarterly/semiannual → one labeled cell per period. Only the current
 * period is interactive (tap = mark used / clear, long-press = log a partial
 * amount); past cells are read-only (used ✓ / missed) and future cells dimmed.
 * Monthly credits don't use this. Mirrors the web PeriodGrid.
 */

type CellState = "used" | "partial" | "current" | "missed" | "upcoming";

function cellState(p: PeriodCell): CellState {
  if (p.used) return "used";
  if (p.usedAmount > 0) return "partial";
  if (p.status === "current") return "current";
  if (p.status === "elapsed") return "missed";
  return "upcoming";
}

export function PeriodGrid({
  periods,
  amount,
  onMarkCurrent,
  onLogPartial,
  pending,
  size = "compact",
}: {
  periods: PeriodCell[];
  amount: number;
  onMarkCurrent: () => void;
  onLogPartial?: (amount: number) => void;
  pending?: boolean;
  size?: "compact" | "full";
}) {
  const { colors } = useTheme();
  if (!periods.length) return null;

  const full = size === "full";
  const single = periods.length === 1; // annual → checkbox
  const cellW = full ? (single ? 108 : 56) : single ? 76 : 42;
  const cellH = full ? 46 : 36;

  const styleFor = (
    state: CellState,
  ): { bg: string; fg: string; border: string; dashed: boolean; dim: number } => {
    switch (state) {
      case "used":
        return { bg: colors.accent, fg: colors.onAccent, border: colors.accent, dashed: false, dim: 1 };
      case "partial":
        return { bg: colors.accentSoft, fg: colors.accentDeep, border: colors.accentSoft, dashed: false, dim: 1 };
      case "current":
        return { bg: "transparent", fg: colors.accent, border: colors.accent, dashed: true, dim: 1 };
      case "missed":
        return { bg: colors.track, fg: colors.tertiary, border: colors.border, dashed: false, dim: 0.7 };
      case "upcoming":
        return { bg: colors.track, fg: colors.tertiary, border: colors.border, dashed: false, dim: 0.45 };
    }
  };

  const glyph = (state: CellState, usedAmount: number): string => {
    switch (state) {
      case "used":
        return "✓";
      case "partial":
        return full ? usd(usedAmount) : "◐";
      case "current":
        return "＋";
      case "missed":
        return "–";
      case "upcoming":
        return "·";
    }
  };

  // iOS-native partial entry; elsewhere long-press falls back to a full mark.
  const promptPartial = () => {
    if (!onLogPartial) return;
    if (Platform.OS !== "ios" || typeof Alert.prompt !== "function") {
      onMarkCurrent();
      return;
    }
    const log = onLogPartial;
    Alert.prompt(
      "Log partial amount",
      `How much did you use? (up to ${usd(amount)})`,
      (text) => {
        const n = parseFloat(text ?? "");
        if (Number.isFinite(n) && n > 0) log(n);
      },
      "plain-text",
      "",
      "number-pad",
    );
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: full ? 8 : 6 }}>
      {periods.map((p) => {
        const state = cellState(p);
        const s = styleFor(state);
        const label = single ? usd(amount) : p.label;
        const cell = (
          <View
            style={{
              width: cellW,
              height: cellH,
              borderRadius: radius.button,
              backgroundColor: s.bg,
              borderWidth: 1,
              borderColor: s.border,
              borderStyle: s.dashed ? "dashed" : "solid",
              alignItems: "center",
              justifyContent: "center",
              opacity: s.dim,
            }}
          >
            <Text variant="button" color={s.fg} style={{ fontSize: full ? 13 : 12, lineHeight: full ? 16 : 14 }}>
              {glyph(state, p.usedAmount)}
            </Text>
            <Text color={s.fg} style={{ fontSize: single ? 11 : full ? 10 : 8.5, lineHeight: 12, marginTop: 1 }}>
              {label}
            </Text>
          </View>
        );

        if (p.status !== "current")
          return <View key={p.key}>{cell}</View>;

        return (
          <Pressable
            key={p.key}
            disabled={pending}
            accessibilityRole="button"
            accessibilityLabel={p.used ? `Clear ${p.label}` : `Mark ${p.label} used`}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onMarkCurrent();
            }}
            onLongPress={onLogPartial ? promptPartial : undefined}
            style={({ pressed }) => ({ opacity: pending ? 0.5 : pressed ? 0.85 : 1 })}
          >
            {cell}
          </Pressable>
        );
      })}
    </View>
  );
}
