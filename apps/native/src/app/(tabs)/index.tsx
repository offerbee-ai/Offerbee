import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useUser } from "@clerk/clerk-expo";

import { ScreenHeader } from "@/components/navigation/ScreenHeader";
import {
  Avatar,
  Card,
  Icon,
  ProgressBar,
  Screen,
  SectionLabel,
  Skeleton,
  Text,
  type IconName,
} from "@/components/ui";
import { spacing, useTheme } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";
import { netStr, usd } from "@/features/credits/derive";
import { CreditRow } from "@/features/credits/components/CreditRow";
import { monthKicker } from "@/lib/dates";

/** Tappable "at a glance" row: icon chip + label, trailing mono value + chevron. */
function GlanceRow({
  icon,
  tone,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  tone: "accent" | "warning";
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: tone === "accent" ? colors.accentSoft : colors.warningSoft,
        }}
      >
        <Icon name={icon} size={18} color={tone === "accent" ? "accent" : "warning"} />
      </View>
      <Text variant="bodyRegular" color="secondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="figureS" color={tone === "warning" ? "warning" : "ink"}>
        {value}
      </Text>
      <Icon name="chevronRight" size={18} color="tertiary" />
    </Pressable>
  );
}

export default function ReviewScreen() {
  const { derived, isLoading, markUsed, pending, now } = useCredits();
  const { user } = useUser();

  const initial = (
    user?.firstName ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    "?"
  )
    .trim()
    .charAt(0);

  const monthEndSum = derived.remainMonth;
  const atRisk3 = derived.decorated
    .filter((c) => !c.used && !c.snoozed && c.days <= 3)
    .reduce((a, c) => a + c.remaining, 0);

  const soon = derived.decorated
    .filter((c) => !c.used && !c.snoozed && c.days <= 7)
    .sort((a, b) => a.days - b.days);
  const soonShown = soon.slice(0, 3);
  const soonSum = soon.reduce((a, c) => a + c.remaining, 0);

  const pctLabel = derived.net >= 0 ? "BREAK-EVEN CLEARED" : "BELOW BREAK-EVEN";

  return (
    <Screen withTabBarClearance>
      <ScreenHeader
        title="Review"
        kicker={monthKicker(now)}
        trailing={
          <Avatar
            initial={initial}
            size={36}
            accessibilityLabel="Settings"
            onPress={() => router.push("/settings")}
          />
        }
      />

      {isLoading ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={150} borderRadius={18} />
          <Skeleton height={90} borderRadius={16} />
          <Skeleton height={200} borderRadius={16} />
        </View>
      ) : (
        <>
          {/* Captured value hero */}
          <Card size="lg">
            <Text variant="sectionLabel" color="tertiary">
              Captured value · {new Date(now).getFullYear()}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.md, marginTop: spacing.sm }}>
              <Text variant="figureL">{usd(derived.captured)}</Text>
              <Text variant="body" color={derived.net >= 0 ? "accent" : "warning"} style={{ marginBottom: 6 }}>
                {netStr(derived.net)}
              </Text>
            </View>
            <Text variant="subtext" color="secondary" style={{ marginTop: 4 }}>
              against {usd(derived.fees)} in annual fees · {derived.cards.length}{" "}
              {derived.cards.length === 1 ? "card" : "cards"}
            </Text>
            <View style={{ marginTop: spacing.base, gap: spacing.sm }}>
              <ProgressBar progress={derived.pct / 100} height={8} />
              <Text variant="sectionLabel" color="tertiary">
                {pctLabel} / {derived.pct}%
              </Text>
            </View>
          </Card>

          {/* At a glance */}
          <SectionLabel>At a glance</SectionLabel>
          <Card style={{ gap: spacing.base }}>
            <GlanceRow
              icon="benefits"
              tone="accent"
              label="Remaining this month"
              value={usd(monthEndSum)}
              onPress={() => router.push("/benefits")}
            />
            <GlanceRow
              icon="clock"
              tone="warning"
              label="Expiring in ≤ 3 days"
              value={usd(atRisk3)}
              onPress={() => router.push("/expiring")}
            />
          </Card>

          {/* Use before they reset */}
          <SectionLabel>Use before they reset</SectionLabel>
          {soonShown.length === 0 ? (
            <Card>
              <Text variant="bodyRegular" color="secondary">
                Nothing at risk this week — you're all caught up.
              </Text>
            </Card>
          ) : (
            <>
              <Card padded={false}>
                {soonShown.map((c, i) => (
                  <CreditRow
                    key={c.id}
                    credit={c}
                    leading="days"
                    pending={pending.has(c.id)}
                    onMarkUsed={() => markUsed(c.id)}
                    onPress={() => router.push(`/credit/${c.id}?from=Review`)}
                    separator={i < soonShown.length - 1}
                  />
                ))}
              </Card>
              <Text variant="caption" color="tertiary" style={{ marginTop: spacing.md, textAlign: "center" }}>
                {soon.length} {soon.length === 1 ? "credit" : "credits"} worth {usd(soonSum)} reset within a week.
              </Text>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
