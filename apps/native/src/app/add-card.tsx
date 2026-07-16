import { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

import { Card, Icon, IconButton, Screen, Skeleton, Text } from "@/components/ui";
import { spacing, useTheme } from "@/theme";
import {
  isPlaidAvailable,
  usePlaidCardLink,
  type DetectResult,
} from "@/features/plaid/usePlaidCardLink";
import { DetectedCardsReview } from "@/features/plaid/DetectedCardsReview";

// Add-card chooser (Design/design_handoff_card_add, state 2b) — the entry
// point for "+ Add card" everywhere. Plaid connect is the recommended path;
// manual catalog search (add-card-search.tsx) is the fallback.
// Expo Go and unconfigured deployments never see the chooser — they're
// routed straight to manual search since Connect can't work there.

export default function AddCardScreen() {
  const { colors } = useTheme();
  const configured = useQuery(api.plaid.plaidConfigured);
  const [result, setResult] = useState<DetectResult | null>(null);

  const { startConnect, busy } = usePlaidCardLink({
    onDetected: (r) => {
      if (r.accounts.length === 0) {
        Alert.alert(
          "No credit cards found",
          "Accounts other than credit cards aren't tracked.",
        );
        return;
      }
      setResult(r);
    },
    onFail: (reason) => {
      // A real error never dead-ends here — fall back to manual search, with
      // a notice so the switch is never silent (design rule #1). A plain
      // user cancel ("exit") just stays on the chooser.
      if (reason === "error")
        router.replace({
          pathname: "/add-card-search",
          params: { notice: "1" },
        });
    },
  });

  const skipChooser = !isPlaidAvailable || configured === false;

  useEffect(() => {
    if (skipChooser) router.replace("/add-card-search");
  }, [skipChooser]);

  const done = () => (router.canGoBack() ? router.back() : router.replace("/cards"));

  if (result) {
    // Fixed (non-scrolling) Screen: DetectedCardsReview owns its scroll
    // region via its internal ScrollView (same as its bottom-sheet usage in
    // PlaidConnectSection) — nesting it in a scrolling Screen would collapse
    // that list and push the "Add N cards" CTA below it.
    return (
      <Screen fixed>
        <View
          style={{
            paddingTop: spacing.lg,
            marginBottom: spacing.sm,
            flexDirection: "row",
            justifyContent: "flex-end",
          }}
        >
          <IconButton icon="close" accessibilityLabel="Close" onPress={done} />
        </View>
        <DetectedCardsReview result={result} onDone={done} />
      </Screen>
    );
  }

  // Effect above will redirect; render nothing in the meantime. Expo Go
  // (isPlaidAvailable is known synchronously) never shows the chooser; an
  // unconfigured deployment may show the loading skeleton for a moment
  // before `configured` resolves to false and this kicks in.
  if (skipChooser) return null;

  return (
    <Screen>
      <View
        style={{
          paddingTop: spacing.lg,
          marginBottom: spacing.lg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text variant="largeTitle" style={{ fontSize: 30, lineHeight: 36 }}>
          Add a card
        </Text>
        <IconButton icon="close" accessibilityLabel="Close" onPress={done} />
      </View>

      {configured === undefined ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={132} borderRadius={16} />
          <Skeleton height={92} borderRadius={16} />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {/* Primary — Connect your bank */}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void startConnect()}
          >
            {({ pressed }) => (
              <Card
                style={{
                  borderWidth: 1.5,
                  borderColor: colors.accent,
                  opacity: busy ? 0.7 : pressed ? 0.9 : 1,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colors.accentSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="link" size={18} color="accent" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: 78 }}>
                    <Text variant="body">
                      {busy ? "Connecting…" : "Connect your bank"}
                    </Text>
                    <Text variant="subtext" color="secondary" style={{ marginTop: 3 }}>
                      Auto-detect your cards and track credits from transactions.
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    position: "absolute",
                    top: spacing.base,
                    right: spacing.base,
                    backgroundColor: colors.accentSoft,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text variant="sectionLabel" color="accentDeep">
                    Recommended
                  </Text>
                </View>
              </Card>
            )}
          </Pressable>

          {/* Secondary — Search manually */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/add-card-search")}
          >
            {({ pressed }) => (
              <Card style={{ opacity: pressed ? 0.9 : 1 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colors.field,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="search" size={18} color="secondary" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="body">Search manually</Text>
                    <Text variant="subtext" color="secondary" style={{ marginTop: 3 }}>
                      Pick from 65+ cards.
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={16} color="tertiary" />
                </View>
              </Card>
            )}
          </Pressable>
        </View>
      )}

      <Text
        variant="sectionLabel"
        color="tertiary"
        style={{ textAlign: "center", marginTop: spacing.xl }}
      >
        Read-only access · Disconnect anytime
      </Text>
    </Screen>
  );
}
