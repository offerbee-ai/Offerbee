import { View } from "react-native";

import { CardArt, CircleCheck, ListRow, PillButton, Text } from "@/components/ui";
import { spacing } from "@/theme";
import { type DerivedCredit } from "../derive";

type CreditRowProps = {
  credit: DerivedCredit;
  pending?: boolean;
  onMarkUsed?: () => void;
  /** When set (and the credit is unused), shows a neutral "Snooze" pill. */
  onSnooze?: () => void;
  /** Row tap → Credit detail. The circle stays a separate press target. */
  onPress?: () => void;
  separator?: boolean;
};

export function CreditRow({
  credit,
  pending = false,
  onMarkUsed,
  onSnooze,
  onPress,
  separator = true,
}: CreditRowProps) {
  return (
    <ListRow
      separator={separator}
      onPress={onPress}
      left={
        <CardArt
          cardKey={credit.cardId}
          imageUrl={credit.image}
          color={credit.color}
          width={34}
        />
      }
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={{ alignItems: "flex-end" }}>
            {credit.used ? (
              <>
                <Text
                  variant="mono"
                  color="tertiary"
                  style={{ textDecorationLine: "line-through" }}
                >
                  {credit.amountStr}
                </Text>
                {credit.claimedLabel ? (
                  <Text variant="caption" color="secondary">
                    {credit.claimedLabel}
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text variant="mono">{credit.amountStr}</Text>
                <Text
                  variant="caption"
                  color={credit.cadenceAlert ? "alert" : "secondary"}
                >
                  {credit.resetShort}
                </Text>
              </>
            )}
          </View>
          {!credit.used && onSnooze ? (
            <PillButton label="Snooze" tone="neutral" onPress={onSnooze} disabled={pending} />
          ) : null}
          {onMarkUsed ? (
            <CircleCheck claimed={credit.used} onPress={onMarkUsed} disabled={pending} />
          ) : null}
        </View>
      }
    >
      <Text variant="body" numberOfLines={1}>
        {credit.name}
      </Text>
      <Text variant="subtext" color="secondary" numberOfLines={1} style={{ marginTop: 1 }}>
        {credit.card}
      </Text>
    </ListRow>
  );
}
