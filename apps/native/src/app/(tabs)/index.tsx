import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

import {
  Card,
  Icon,
  IconButton,
  ProgressBar,
  Screen,
  SectionLabel,
  SegmentedControl,
  Skeleton,
  Text,
  type IconName,
} from "@/components/ui";
import { spacing, useTheme } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";
import { netStr, usd } from "@/features/credits/derive";
import { useReviewExpiring } from "@/features/credits/useReviewExpiring";
import { CreditRow } from "@/features/credits/components/CreditRow";
import { LocationPrimerSheet } from "@/features/nearby/LocationPrimerSheet";
import { monthKicker } from "@/lib/dates";

/** Tappable "at a glance" row: icon chip + label, trailing mono value + chevron. */
function GlanceRow({
  icon,
  tone,
  label,
  value,
  valueColor = "ink",
  onPress,
}: {
  icon: IconName;
  tone: "accent" | "warning";
  label: string;
  value: string;
  valueColor?: "ink" | "accent" | "warning";
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
      <Text variant="figureS" color={valueColor}>
        {value}
      </Text>
      <Icon name="chevronRight" size={18} color="tertiary" />
    </Pressable>
  );
}

export default function ReviewScreen() {
  const { derived, isLoading, markUsed, snooze, pending, now } = useCredits();
  const unread = useQuery(api.notifications.unreadCount) ?? 0;
  const { range, setRange, exp, urgentGroup, laterMonthCount } = useReviewExpiring();

  const pctLabel = derived.net >= 0 ? "BREAK-EVEN CLEARED" : "BELOW BREAK-EVEN";

  return (
    <Screen
      withTabBarClearance
      header={{
        title: "Review",
        kicker: monthKicker(now),
        trailing: (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <IconButton
              icon="bell"
              tint="accent"
              badge={unread}
              accessibilityLabel="Notifications"
              onPress={() => router.push("/notifications")}
            />
            <IconButton
              icon="settings"
              tint="accent"
              accessibilityLabel="Settings"
              onPress={() => router.push("/settings")}
            />
          </View>
        ),
      }}
    >
      <LocationPrimerSheet />
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
              value={usd(derived.remainMonth)}
              onPress={() => router.push("/benefits")}
            />
            <GlanceRow
              icon="card"
              tone="accent"
              label="Net across your cards"
              value={netStr(derived.net)}
              valueColor={derived.net >= 0 ? "accent" : "warning"}
              onPress={() => router.push("/cards")}
            />
          </Card>

          {/* Expiring (merged from the former standalone tab) */}
          <SectionLabel
            right={
              urgentGroup ? (
                <Text variant="sectionLabel" color="alert">
                  {urgentGroup.sumStr}
                </Text>
              ) : undefined
            }
          >
            Expiring
          </SectionLabel>
          <SegmentedControl
            options={[
              { value: "week", label: "This week" },
              { value: "month", label: "This month" },
            ]}
            value={range}
            onChange={setRange}
          />

          {exp.groups.length === 0 && !(range === "week" && laterMonthCount > 0) ? (
            <Card style={{ marginTop: spacing.md }}>
              <Text variant="bodyRegular" color="secondary">
                Nothing at risk {range === "week" ? "this week" : "this month"} — you're all caught up.
              </Text>
            </Card>
          ) : (
            <>
              {exp.groups.length === 0 ? (
                <Card style={{ marginTop: spacing.md }}>
                  <Text variant="bodyRegular" color="secondary">
                    Nothing at risk in the next 7 days.
                  </Text>
                </Card>
              ) : null}
              {exp.groups.map((group) => (
                <View key={group.label} style={{ marginTop: spacing.md }}>
                  {!group.urgent ? (
                    <SectionLabel
                      right={
                        <Text variant="sectionLabel" color="tertiary">
                          {group.sumStr}
                        </Text>
                      }
                    >
                      Later this month
                    </SectionLabel>
                  ) : null}
                  <Card padded={false} style={{ marginTop: group.urgent ? 0 : spacing.md }}>
                    {group.items.map((c, i) => (
                      <CreditRow
                        key={c.id}
                        credit={c}
                        pending={pending.has(c.id)}
                        onMarkUsed={() => markUsed(c.id)}
                        onSnooze={group.urgent ? undefined : () => snooze(c.id)}
                        onPress={() => router.push(`/credit/${c.id}?from=Review`)}
                        separator={i < group.items.length - 1}
                      />
                    ))}
                  </Card>
                </View>
              ))}

              {range === "week" && laterMonthCount > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRange("month")}
                  style={({ pressed }) => ({ marginTop: spacing.base, opacity: pressed ? 0.6 : 1 })}
                >
                  <Text variant="caption" color="accent" style={{ textAlign: "center" }}>
                    {laterMonthCount} more {laterMonthCount === 1 ? "credit" : "credits"} reset later this
                    month →
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
