import { View } from "react-native";

import { CardArt, ListRow, PillButton, Text } from "@/components/ui";
import { spacing } from "@/theme";
import { hasGrid, type DerivedCredit } from "../derive";
import { DaysTile } from "./DaysTile";
import { PeriodGrid } from "./PeriodGrid";

type CreditRowProps = {
  credit: DerivedCredit;
  /** days = countdown tile (Review/Expiring); art = card art (Benefits). */
  leading?: "days" | "art";
  pending?: boolean;
  onMarkUsed?: () => void;
  onLogPartial?: (amount: number) => void;
  onSnooze?: () => void;
  /** Row tap → Credit detail. The action pill stays a separate press target. */
  onPress?: () => void;
  /** Override the mark-used pill label/tone (e.g. "Use" accent on Expiring). */
  markLabel?: string;
  markTone?: "accent" | "soft" | "neutral";
  separator?: boolean;
};

export function CreditRow({
  credit,
  leading = "art",
  pending = false,
  onMarkUsed,
  onLogPartial,
  onSnooze,
  onPress,
  markLabel,
  markTone,
  separator = true,
}: CreditRowProps) {
  // Non-monthly credits render a per-period grid (annual → checkbox) inline
  // instead of the single mark-used pill; the grid's current cell is the
  // interactive control. Monthly keeps the pill.
  const showGrid = hasGrid(credit.cycle) && !!credit.periods && !!onMarkUsed;

  return (
    <ListRow
      separator={separator}
      onPress={onPress}
      left={
        leading === "days" ? (
          <DaysTile days={credit.days} urgent={credit.urgentReset} />
        ) : (
          <CardArt cardKey={credit.cardId} imageUrl={credit.image} color={credit.color} width={44} />
        )
      }
      right={
        <>
          {onSnooze && !credit.used ? (
            <PillButton label="Snooze" tone="neutral" onPress={onSnooze} disabled={pending} />
          ) : null}
          {onMarkUsed && !showGrid ? (
            credit.used ? (
              <PillButton label="Used ✓" tone="neutral" onPress={onMarkUsed} disabled={pending} />
            ) : (
              <PillButton
                label={markLabel ?? (onSnooze ? "Use" : "Mark used")}
                tone={markTone ?? (onSnooze ? "accent" : "soft")}
                onPress={onMarkUsed}
                disabled={pending}
              />
            )
          ) : null}
        </>
      }
    >
      <Text variant="body" numberOfLines={1}>
        {credit.name}
      </Text>
      <Text
        variant="subtext"
        color={credit.urgentReset ? "alert" : "secondary"}
        numberOfLines={1}
        style={{ marginTop: 1 }}
      >
        {credit.sub} · {credit.reset}
      </Text>
      {showGrid && credit.periods ? (
        <View style={{ marginTop: spacing.sm }}>
          <PeriodGrid
            periods={credit.periods}
            amount={credit.amount}
            onMarkCurrent={onMarkUsed!}
            onLogPartial={onLogPartial}
            pending={pending}
          />
        </View>
      ) : null}
    </ListRow>
  );
}
