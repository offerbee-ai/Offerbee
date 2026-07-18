import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";

import { ScreenHeader } from "@/components/navigation/ScreenHeader";
import {
  Card,
  EmptyState,
  IconButton,
  Screen,
  SectionLabel,
  SegmentedControl,
  Skeleton,
  Text,
} from "@/components/ui";
import { spacing } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";
import { expiringGroups } from "@/features/credits/derive";
import { CreditRow } from "@/features/credits/components/CreditRow";

export default function ExpiringScreen() {
  const { credits, derived, isLoading, markUsed, pending } = useCredits();
  const [range, setRange] = useState<"week" | "month">("week");
  const { groups } = expiringGroups(credits, range);

  // In week range, how many more reset in the 8–31 day window (for the footer link).
  const laterMonthCount = derived.decorated.filter(
    (c) => !c.used && !c.snoozed && c.days > 7 && c.days <= 31,
  ).length;

  return (
    <Screen withTabBarClearance>
      <ScreenHeader
        title="Expiring"
        trailing={
          <IconButton
            icon="bell"
            accessibilityLabel="Notifications"
            onPress={() => router.push("/notifications")}
          />
        }
      />

      <SegmentedControl
        options={[
          { value: "week", label: "This week" },
          { value: "month", label: "This month" },
        ]}
        value={range}
        onChange={setRange}
      />

      {isLoading ? (
        <View style={{ gap: spacing.md, marginTop: spacing.base }}>
          <Skeleton height={180} borderRadius={16} />
          <Skeleton height={120} borderRadius={16} />
        </View>
      ) : groups.length === 0 && !(range === "week" && laterMonthCount > 0) ? (
        <EmptyState
          icon="clock"
          title="Nothing expiring"
          subtitle={`No unused credits reset ${range === "week" ? "this week" : "this month"}. Nice.`}
        />
      ) : (
        <>
          {groups.length === 0 ? (
            <>
              <SectionLabel>This week</SectionLabel>
              <Card>
                <Text variant="bodyRegular" color="secondary">
                  Nothing at risk in the next 7 days.
                </Text>
              </Card>
            </>
          ) : null}
          {groups.map((group) => (
            <View key={group.label}>
              <SectionLabel
                right={
                  <Text variant="sectionLabel" color={group.urgent ? "alert" : "tertiary"}>
                    {group.sumStr}
                  </Text>
                }
              >
                {group.urgent ? "This week" : "Later this month"}
              </SectionLabel>
              <Card padded={false}>
                {group.items.map((c, i) => (
                  <CreditRow
                    key={c.id}
                    credit={c}
                    pending={pending.has(c.id)}
                    onMarkUsed={() => markUsed(c.id)}
                    onPress={() => router.push(`/credit/${c.id}?from=Expiring`)}
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
    </Screen>
  );
}
