import { CardArt, ListRow, PillButton, Text } from "@/components/ui";
import type { DerivedCredit } from "../derive";
import { DaysTile } from "./DaysTile";

type CreditRowProps = {
  credit: DerivedCredit;
  /** days = countdown tile (Review/Expiring); art = card art (Benefits). */
  leading?: "days" | "art";
  pending?: boolean;
  onMarkUsed?: () => void;
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
  onSnooze,
  onPress,
  markLabel,
  markTone,
  separator = true,
}: CreditRowProps) {
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
          {onMarkUsed ? (
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
    </ListRow>
  );
}
