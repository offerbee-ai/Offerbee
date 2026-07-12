import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { ScreenHeader } from "@/components/navigation/ScreenHeader";
import {
  Card,
  EmptyState,
  IconButton,
  ProgressBar,
  Screen,
  SearchField,
  SectionLabel,
  SegmentedControl,
  Skeleton,
  Text,
} from "@/components/ui";
import { spacing } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";
import { filterBenefits, usd, type Cycle } from "@/features/credits/derive";
import { CreditRow } from "@/features/credits/components/CreditRow";

type Segment = Extract<Cycle, "monthly" | "quarterly" | "annual">;

export default function BenefitsScreen() {
  const { credits, isLoading, markUsed, pending, now } = useCredits();
  const [segment, setSegment] = useState<Segment>("monthly");
  const [search, setSearch] = useState("");

  const { visible, available, openCount } = filterBenefits(credits, segment, search);
  const capturedInSegment = visible.reduce(
    (a, c) => a + Math.min(c.usedAmount, c.amount),
    0,
  );
  const totalInSegment = visible.reduce((a, c) => a + c.amount, 0);
  const d = new Date(now);
  const summaryLabel =
    segment === "monthly"
      ? `${d.toLocaleDateString("en-US", { month: "long" })} · captured`
      : segment === "quarterly"
        ? `Q${Math.floor(d.getMonth() / 3) + 1} · captured`
        : `${d.getFullYear()} · captured`;

  return (
    <Screen withTabBarClearance>
      <ScreenHeader
        title="Benefits"
        trailing={
          <IconButton icon="sliders" accessibilityLabel="Filter credits" onPress={() => {}} />
        }
      />

      <View style={{ gap: spacing.md }}>
        <SearchField placeholder="Search credits" value={search} onChangeText={setSearch} />
        <SegmentedControl
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "quarterly", label: "Quarterly" },
            { value: "annual", label: "Annual" },
          ]}
          value={segment}
          onChange={setSegment}
        />
      </View>

      {isLoading ? (
        <View style={{ gap: spacing.md, marginTop: spacing.base }}>
          <Skeleton height={70} borderRadius={16} />
          <Skeleton height={260} borderRadius={16} />
        </View>
      ) : (
        <>
          <Card style={{ marginTop: spacing.base }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="bodyRegular" color="secondary">
                {summaryLabel}
              </Text>
              <Text variant="figureS">
                {usd(capturedInSegment)}{" "}
                <Text variant="subtext" color="tertiary">
                  / {usd(totalInSegment)}
                </Text>
              </Text>
            </View>
            <View style={{ marginTop: spacing.md }}>
              <ProgressBar
                progress={totalInSegment > 0 ? capturedInSegment / totalInSegment : 0}
              />
            </View>
          </Card>

          <SectionLabel
            right={
              <Text variant="sectionLabel" color="tertiary">
                {visible.length}
              </Text>
            }
          >
            {`${segment} credits`}
          </SectionLabel>

          {visible.length === 0 ? (
            <EmptyState
              icon="benefits"
              title={search ? "No credits match" : "No credits in this cycle"}
              subtitle={
                search
                  ? "Try a different search."
                  : "Track credits from a card's detail page."
              }
            />
          ) : (
            <Card padded={false}>
              {visible.map((c, i) => (
                <CreditRow
                  key={c.id}
                  credit={c}
                  leading="art"
                  pending={pending.has(c.id)}
                  onMarkUsed={() => markUsed(c.id)}
                  onPress={() => router.push(`/credit/${c.id}?from=Benefits`)}
                  separator={i < visible.length - 1}
                />
              ))}
            </Card>
          )}

          {openCount > 0 ? (
            <Text
              variant="caption"
              color="tertiary"
              style={{ marginTop: spacing.base, textAlign: "center" }}
            >
              {usd(available)} still available across {openCount}{" "}
              {openCount === 1 ? "credit" : "credits"}.
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}
