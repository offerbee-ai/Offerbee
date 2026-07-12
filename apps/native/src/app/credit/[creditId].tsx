import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";

import {
  Button,
  Card,
  CardArt,
  Icon,
  ProgressBar,
  Screen,
  SectionLabel,
  Text,
} from "@/components/ui";
import { InlineHeader } from "@/components/navigation/InlineHeader";
import { radius, spacing, useTheme } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";
import { usd, type Cycle } from "@/features/credits/derive";

const PERIODS_PER_YEAR: Record<Cycle, number> = {
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
};

/** One "Details" row: label on the left, value (mono) + optional chevron. */
function DetailRow({
  label,
  value,
  valueColor = "ink",
  onPress,
  separator = true,
}: {
  label: string;
  value: string;
  valueColor?: string;
  onPress?: () => void;
  separator?: boolean;
}) {
  const { colors } = useTheme();
  const body = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.base,
      }}
    >
      <Text variant="bodyRegular" color="secondary">
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text variant="mono" color={valueColor}>
          {value}
        </Text>
        {onPress ? <Icon name="chevronRight" size={16} color="tertiary" /> : null}
      </View>
    </View>
  );
  return (
    <View>
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          {body}
        </Pressable>
      ) : (
        body
      )}
      {separator ? (
        <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: spacing.base }} />
      ) : null}
    </View>
  );
}

export default function CreditDetailScreen() {
  const { creditId, from } = useLocalSearchParams<{ creditId: string; from?: string }>();
  const { colors } = useTheme();
  const { derived, markUsed, pending } = useCredits();

  const credit = derived.decorated.find((c) => c.id === creditId);
  const backLabel = from && from.length ? from : "Back";

  if (!credit) {
    return (
      <Screen>
        <InlineHeader backLabel={backLabel} onBack={() => router.back()} title="Credit" />
        <Card style={{ marginTop: spacing.base }}>
          <Text variant="bodyRegular" color="secondary">
            This credit is no longer available.
          </Text>
        </Card>
      </Screen>
    );
  }

  const urgent = credit.urgentReset;
  const periodPct = credit.amount > 0 ? Math.min(1, credit.usedAmount / credit.amount) : 0;
  const periodPctLabel = Math.round(periodPct * 100);
  const annualValue = credit.amount * (PERIODS_PER_YEAR[credit.cycle] ?? 1);
  const busy = pending.has(credit.id);

  const status = credit.used
    ? "used this cycle ✓"
    : `resets in ${credit.days} ${credit.days === 1 ? "day" : "days"}`;
  const statusColor = credit.used ? "accent" : urgent ? "warning" : "secondary";

  return (
    <Screen>
      <InlineHeader backLabel={backLabel} onBack={() => router.back()} title={credit.name} />

      {/* Status card */}
      <Card size="lg" style={{ marginTop: spacing.xs, gap: spacing.base }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <CardArt cardKey={credit.cardId} imageUrl={credit.image} color={credit.color} width={44} />
          <Text variant="body" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
            {credit.card}
          </Text>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              backgroundColor: urgent ? colors.warningSoft : colors.field,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text variant="figureS" color={urgent ? "warning" : "secondary"}>
              {credit.days}
            </Text>
            <Text
              variant="caption"
              style={{ fontSize: 9, marginTop: -2 }}
              color={urgent ? "warning" : "tertiary"}
            >
              {credit.days === 1 ? "day" : "days"}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.md }}>
          <Text variant="figureL" style={{ fontSize: 38, lineHeight: 42 }}>
            {credit.amountStr}
          </Text>
          <Text variant="body" color={statusColor}>
            {status}
          </Text>
        </View>

        <View style={{ gap: 6 }}>
          <ProgressBar progress={periodPct} height={8} tone={urgent ? "warning" : "accent"} />
          <Text variant="subtext" color="secondary">
            {usd(credit.usedAmount)} of {credit.amountStr} captured this cycle · {periodPctLabel}%
          </Text>
        </View>

        {credit.used ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              markUsed(credit.id);
            }}
            style={({ pressed }) => ({
              height: 48,
              borderRadius: radius.button,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <Text variant="button" color="accentDeep">
              Used this cycle ✓
            </Text>
          </Pressable>
        ) : (
          <Button label="Mark used" onPress={() => markUsed(credit.id)} disabled={busy} />
        )}
      </Card>

      {/* Details */}
      <SectionLabel>Details</SectionLabel>
      <Card padded={false}>
        <DetailRow
          label="Card"
          value={credit.card}
          onPress={() => router.push(`/card/${credit.cardId}`)}
        />
        <DetailRow label="Cycle" value={credit.cycleLabel} />
        <DetailRow
          label="Resets in"
          value={`${credit.days} ${credit.days === 1 ? "day" : "days"}`}
          valueColor={urgent ? colors.warning : colors.ink}
        />
        <DetailRow label="Annual value" value={usd(annualValue)} separator={false} />
      </Card>

      <Text
        variant="caption"
        color="tertiary"
        style={{ marginTop: spacing.base, textAlign: "center" }}
      >
        Marking used updates every total instantly.
      </Text>
    </Screen>
  );
}
