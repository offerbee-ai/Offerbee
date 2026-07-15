import { useEffect, useMemo, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { api } from "@packages/backend/convex/_generated/api";
import { ONBOARDING_CARDS } from "@packages/backend/convex/onboardingCatalog";

import { Card, CardArt, Icon, PillButton, SearchField, Text } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { usd } from "@/features/credits/derive";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { StepChrome } from "@/features/onboarding/StepChrome";

export default function OnboardingWallet() {
  const { colors } = useTheme();
  // Set when the Plaid gate (connect.tsx) fell back here after a failed or
  // empty connect — the switch is never silent (design rule #1). Fixed copy.
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const { cards, toggleCard, setStep } = useOnboarding();
  const art = useQuery(api.catalog.onboardingCardArt);
  const win = useWindowDimensions();
  const [query, setQuery] = useState("");

  useEffect(() => setStep(1), [setStep]);

  const popular = useMemo(() => ONBOARDING_CARDS.filter((c) => c.popular), []);
  const tileWidth = (win.width - spacing.screenInset * 2 - spacing.md) / 2;

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return ONBOARDING_CARDS.filter(
      (c) => c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q),
    );
  }, [q]);

  return (
    <StepChrome
      step={1}
      title="Which cards are in your wallet?"
      subtitle="No bank logins — just pick the cards you hold. You can add more later."
      continueDisabled={cards.length === 0}
      onContinue={() => router.replace("/(onboarding)/spending")}
    >
      {notice ? (
        // Ink toast — same treatment as add-card-search.tsx's fallback
        // banner (design state 1c). Icon color is content, not a theme token.
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            backgroundColor: colors.ink,
            borderRadius: radius.card,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.base,
            marginBottom: spacing.base,
          }}
        >
          <Icon name="alert" size={16} color="#F5B14D" />
          <Text variant="subtext" color={colors.background} style={{ flex: 1 }}>
            Couldn&apos;t connect — pick your cards manually instead.
          </Text>
        </View>
      ) : null}

      {/* 2-column grid of popular cards */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
        {popular.map((card) => {
          const selected = cards.includes(card.id);
          const detail = art?.[card.cardKey];
          const fee = detail?.annualFee ?? card.fee;
          return (
            <Pressable
              key={card.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                toggleCard(card.id);
              }}
              style={({ pressed }) => ({
                width: tileWidth,
                backgroundColor: colors.surface,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.accent : colors.border,
                borderRadius: radius.card,
                padding: spacing.md,
                opacity: pressed ? 0.9 : 1,
                ...(selected
                  ? {
                      shadowColor: colors.accent,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.18,
                      shadowRadius: 10,
                      elevation: 3,
                    }
                  : {}),
              })}
            >
              <View>
                <CardArt
                  cardKey={card.cardKey}
                  imageUrl={detail?.imageUrl}
                  color={card.color}
                  width={tileWidth - spacing.md * 2}
                  height={62}
                  borderRadius={10}
                />
                {selected ? (
                  <View
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: colors.accent,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderColor: colors.surface,
                    }}
                  >
                    <Icon name="check" size={14} color="onAccent" />
                  </View>
                ) : null}
              </View>
              <Text variant="body" numberOfLines={1} style={{ fontSize: 14, marginTop: spacing.sm }}>
                {card.name}
              </Text>
              <Text variant="subtext" color="tertiary" numberOfLines={1} style={{ marginTop: 1 }}>
                {usd(fee)}/yr · {usd(card.credits)} value
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Search the full catalog */}
      <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
        <SearchField placeholder="Search 65+ cards" value={query} onChangeText={setQuery} />
        {q ? (
          results.length > 0 ? (
            <Card padded={false}>
              {results.map((card, i) => {
                const selected = cards.includes(card.id);
                const detail = art?.[card.cardKey];
                return (
                  <View
                    key={card.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.md,
                      paddingVertical: spacing.rowPadY,
                      paddingHorizontal: spacing.rowPadX,
                      borderBottomWidth: i < results.length - 1 ? 1 : 0,
                      borderBottomColor: colors.separator,
                    }}
                  >
                    <CardArt
                      cardKey={card.cardKey}
                      imageUrl={detail?.imageUrl}
                      color={card.color}
                      width={40}
                    />
                    <View style={{ flex: 1 }}>
                      <Text variant="body" numberOfLines={1}>
                        {card.name}
                      </Text>
                      <Text variant="subtext" color="tertiary" numberOfLines={1} style={{ marginTop: 1 }}>
                        {card.issuer}
                      </Text>
                    </View>
                    <PillButton
                      label={selected ? "Added ✓" : "Add"}
                      tone={selected ? "soft" : "accent"}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        toggleCard(card.id);
                      }}
                    />
                  </View>
                );
              })}
            </Card>
          ) : (
            <Card>
              <Text variant="bodyRegular" color="secondary" style={{ textAlign: "center" }}>
                No cards match — try an issuer name.
              </Text>
            </Card>
          )
        ) : null}
      </View>
    </StepChrome>
  );
}
