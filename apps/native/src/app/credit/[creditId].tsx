import { Alert, Platform, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";

import {
  Button,
  Card,
  CardArt,
  CircleCheck,
  Icon,
  IconButton,
  ProgressBar,
  Screen,
  SectionLabel,
  Text,
} from "@/components/ui";
import { InlineHeader } from "@/components/navigation/InlineHeader";
import { goBack } from "@/features/nav/back";
import { radius, spacing, useTheme } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";
import { hasGrid, usd, type Cycle } from "@/features/credits/derive";
import { PeriodGrid } from "@/features/credits/components/PeriodGrid";

const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const PERIOD_WORD: Record<Cycle, string> = {
  monthly: "month",
  quarterly: "quarter",
  semiannual: "half-year",
  annual: "year",
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
  const { derived, markUsed, logPartial, snooze, untrack, pending, now } = useCredits();

  const credit = derived.decorated.find((c) => c.id === creditId);
  const backLabel = from && from.length ? from : "Back";

  const busy = pending.has(credit?.id ?? "");
  const onOverflow = () => {
    if (!credit) return;
    const canPrompt = Platform.OS === "ios" && typeof Alert.prompt === "function";
    Alert.alert(credit.name, undefined, [
      ...(canPrompt
        ? [{
            text: "Log partial amount",
            onPress: () =>
              Alert.prompt!(
                "Log partial amount",
                `How much of the ${usd(credit.amount)} did you claim?`,
                (text) => {
                  const n = parseFloat(text ?? "");
                  if (Number.isFinite(n) && n > 0) logPartial(credit.id, n);
                },
                "plain-text",
                "",
                "decimal-pad",
              ),
          }]
        : []),
      ...(!credit.used ? [{ text: "Snooze", onPress: () => snooze(credit.id) }] : []),
      {
        text: "Stop tracking",
        style: "destructive" as const,
        onPress: () => {
          untrack(credit.id);
          goBack(`/card/${credit.cardId}`);
        },
      },
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  if (!credit) {
    return (
      <Screen>
        <InlineHeader backLabel={backLabel} onBack={() => goBack("/cards")} title="Credit" />
        <Card style={{ marginTop: spacing.base }}>
          <Text variant="bodyRegular" color="secondary">
            This credit is no longer available.
          </Text>
        </Card>
      </Screen>
    );
  }

  const av = credit.annualValue;
  const monthName = FULL_MONTHS[new Date(now).getUTCMonth()];
  const heroCadence =
    credit.cycle === "monthly"
      ? `${credit.cycleLabel} credit · resets in ${credit.days} ${credit.days === 1 ? "day" : "days"}`
      : `${credit.cycleLabel} credit · ${credit.resetShort}`;

  return (
    <Screen>
      <InlineHeader
        backLabel={backLabel}
        onBack={() => goBack(`/card/${credit.cardId}`)}
        title={credit.name}
        trailing={
          <IconButton
            icon="ellipsis"
            accessibilityLabel="Credit options"
            onPress={onOverflow}
          />
        }
      />

      {/* Hero */}
      <Card size="lg" style={{ marginTop: spacing.xs, gap: spacing.base }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <CardArt cardKey={credit.cardId} imageUrl={credit.image} color={credit.color} width={44} />
          <Text variant="body" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
            {credit.card}
          </Text>
          <CircleCheck claimed={credit.used} onPress={() => markUsed(credit.id)} disabled={busy} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.md }}>
          <Text
            variant="figureL"
            color={credit.used ? "tertiary" : "ink"}
            style={{
              fontSize: 38,
              lineHeight: 42,
              textDecorationLine: credit.used ? "line-through" : "none",
            }}
          >
            {credit.amountStr}
          </Text>
          <Text variant="body" color="secondary">
            {credit.used ? `claimed this ${PERIOD_WORD[credit.cycle]}` : `to claim this ${PERIOD_WORD[credit.cycle]}`}
          </Text>
        </View>
        <Text variant="subtext" color={credit.cadenceAlert ? "alert" : "secondary"}>
          {heroCadence}
        </Text>

        <View style={{ gap: 6 }}>
          <ProgressBar progress={credit.yearBarPct / 100} height={7} tone="accent" />
          <Text variant="subtext" color="secondary">
            {credit.yearBarLabel} captured · {credit.periodsSummary}
          </Text>
        </View>

        {hasGrid(credit.cycle) && credit.periods ? (
          <PeriodGrid
            periods={credit.periods}
            amount={credit.amount}
            onMarkCurrent={() => markUsed(credit.id)}
            onLogPartial={(amt) => logPartial(credit.id, amt)}
            pending={busy}
            size="full"
          />
        ) : credit.used ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Undo claim for ${monthName}`}
            accessibilityState={{ disabled: busy }}
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
              Claimed for {monthName} ✓
            </Text>
          </Pressable>
        ) : (
          <Button label={`Mark claimed for ${monthName}`} onPress={() => markUsed(credit.id)} disabled={busy} />
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
        <DetailRow
          label="Cycle"
          value={`${credit.cycleLabel} · ${usd(credit.amount)} per ${PERIOD_WORD[credit.cycle]}`}
        />
        <DetailRow
          label="Resets in"
          value={`${credit.days} ${credit.days === 1 ? "day" : "days"}`}
          valueColor={credit.cadenceAlert ? colors.alert : colors.ink}
        />
        <DetailRow label="Annual value" value={usd(av)} separator={false} />
      </Card>
      <Text variant="caption" color="tertiary" style={{ marginTop: spacing.sm, paddingHorizontal: spacing.xs }}>
        Unclaimed {PERIOD_WORD[credit.cycle]}s don't roll over. Marking claimed updates every total instantly.
      </Text>

      {/* This year (monthly only) */}
      {credit.cycle === "monthly" && credit.periods ? (
        <>
          <SectionLabel>This year</SectionLabel>
          <Card>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {credit.periods.map((p) => (
                <View key={p.key} style={{ flex: 1, alignItems: "center" }}>
                  <View
                    style={{
                      height: 34,
                      alignSelf: "stretch",
                      borderRadius: 7,
                      backgroundColor: p.used
                        ? colors.accent
                        : p.status === "current"
                          ? colors.accentSoft
                          : colors.field,
                      borderWidth: p.status === "current" && !p.used ? 1.5 : 0,
                      borderColor: colors.accent,
                      borderStyle: "dashed",
                    }}
                  />
                  <Text
                    variant="caption"
                    color={p.status === "current" ? "accent" : "secondary"}
                    numberOfLines={1}
                    allowFontScaling={false}
                    style={{ fontSize: 10, marginTop: 4 }}
                  >
                    {p.label}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
          <Text variant="caption" color="tertiary" style={{ marginTop: spacing.sm, paddingHorizontal: spacing.xs }}>
            Filled = claimed month · dashed = this month, still open.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
