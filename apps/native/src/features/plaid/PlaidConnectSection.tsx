import { useState } from "react";
import { Alert, Platform, View } from "react-native";
import {
  createPlaidLinkSession,
  type LinkSuccess,
} from "react-native-plaid-link-sdk";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

import { Button, Card, PillButton, SectionLabel, Text } from "@/components/ui";
import { spacing, useTheme } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";

// Native "Connected accounts": Plaid Link connect + per-account → wallet-card
// linking. Requires a dev client (Plaid's native module isn't in Expo Go).
export function PlaidConnectSection() {
  const { colors } = useTheme();
  const configured = useQuery(api.plaid.plaidConfigured);
  const connections = useQuery(api.plaid.listConnections);
  const { walletCards } = useCredits();
  const createLinkToken = useAction(api.plaid.createLinkToken);
  const createUpdateLinkToken = useAction(api.plaid.createUpdateLinkToken);
  const exchange = useAction(api.plaid.exchangePublicToken);
  const reactivate = useMutation(api.plaid.reactivateItem);
  const linkAccount = useMutation(api.plaid.linkAccountToCard);
  const linkCatalog = useAction(api.plaid.linkAccountToCatalogCard);
  const searchCards = useAction(api.rapidapi.searchCards);
  const removeConnection = useAction(api.plaid.removeConnection);
  const [busy, setBusy] = useState(false);

  if (configured === false) {
    return (
      <>
        <SectionLabel>Connected accounts</SectionLabel>
        <Card>
          <Text variant="subtext" color="secondary">
            Bank connections aren&apos;t configured yet.
          </Text>
        </Card>
      </>
    );
  }

  const onConnect = async () => {
    setBusy(true);
    try {
      const { linkToken } = await createLinkToken({});
      const session = await createPlaidLinkSession({
        token: linkToken,
        onSuccess: async (success: LinkSuccess) => {
          try {
            await exchange({
              publicToken: success.publicToken,
              institutionId: success.metadata?.institution?.id,
              institutionName: success.metadata?.institution?.name,
            });
          } catch (e) {
            Alert.alert("Couldn't link account", String(e));
          }
        },
        onExit: () => {},
        onEvent: () => {},
      });
      await session.open();
    } catch (e) {
      Alert.alert(
        "Plaid unavailable",
        "Connecting a card needs a development build (not Expo Go).\n\n" +
          String(e),
      );
    } finally {
      setBusy(false);
    }
  };

  // Re-authenticate an existing connection (Plaid Link update mode).
  const onReauth = async (itemId: string) => {
    setBusy(true);
    try {
      const { linkToken } = await createUpdateLinkToken({ itemId });
      const session = await createPlaidLinkSession({
        token: linkToken,
        onSuccess: async () => {
          try {
            await reactivate({ itemId });
          } catch (e) {
            Alert.alert("Couldn't reconnect", String(e));
          }
        },
        onExit: () => {},
        onEvent: () => {},
      });
      await session.open();
    } catch (e) {
      Alert.alert("Reconnect unavailable", String(e));
    } finally {
      setBusy(false);
    }
  };

  // Search the catalog for a card the user doesn't own yet, then link it (adds
  // it to the wallet + seeds credits). iOS-only (Alert.prompt); the wallet-card
  // options cover other platforms.
  const searchAndLink = (accountId: string) => {
    if (Platform.OS !== "ios" || typeof Alert.prompt !== "function") {
      Alert.alert(
        "Add the card first",
        "Add the card to your wallet from the Cards tab, then link it here.",
      );
      return;
    }
    Alert.prompt(
      "Find a card",
      "Type a card name (e.g. Sapphire, Freedom)",
      async (text) => {
        const term = (text ?? "").trim();
        if (term.length < 2) return;
        try {
          const results = await searchCards({ term });
          if (!results.length) {
            Alert.alert("No matches", "Try a different name.");
            return;
          }
          Alert.alert("Link to which card?", undefined, [
            ...results.slice(0, 5).map((r) => ({
              text: r.cardName,
              onPress: () =>
                void linkCatalog({ accountId, cardKey: r.cardKey }),
            })),
            { text: "Cancel", style: "cancel" as const },
          ]);
        } catch (e) {
          Alert.alert("Search failed", String(e));
        }
      },
      "plain-text",
    );
  };

  const pickCard = (accountId: string, current: string | null) => {
    const buttons: {
      text: string;
      style?: "cancel" | "destructive";
      onPress?: () => void;
    }[] = walletCards.map((c) => ({
      text: c.name + (c.userCardId === current ? "  ✓" : ""),
      onPress: () => void linkAccount({ accountId, userCardId: c.userCardId }),
    }));
    buttons.push({
      text: "Search for another card…",
      onPress: () => searchAndLink(accountId),
    });
    if (current)
      buttons.push({
        text: "Unlink",
        style: "destructive",
        onPress: () => void linkAccount({ accountId, userCardId: null }),
      });
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Link this account to a card", undefined, buttons);
  };

  const onDisconnect = (itemId: string, name: string) => {
    Alert.alert(`Disconnect ${name}?`, "Auto-logged usage will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => void removeConnection({ itemId }),
      },
    ]);
  };

  return (
    <>
      <SectionLabel>Connected accounts</SectionLabel>

      {(connections ?? []).map((conn) => (
        <Card key={conn.itemId} padded={false} style={{ marginBottom: spacing.md }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: spacing.base,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="body">{conn.institutionName}</Text>
              <Text
                variant="subtext"
                color={conn.status === "active" ? "secondary" : "alert"}
                style={{ marginTop: 1 }}
              >
                {conn.status === "active"
                  ? `${conn.accounts.length} account${conn.accounts.length === 1 ? "" : "s"}`
                  : conn.status === "login_required"
                    ? "Reconnect needed"
                    : "Connection error"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              {conn.status !== "active" && (
                <PillButton
                  label="Reconnect"
                  tone="accent"
                  disabled={busy}
                  onPress={() => onReauth(conn.itemId)}
                />
              )}
              <PillButton
                label="Disconnect"
                tone="neutral"
                onPress={() => onDisconnect(conn.itemId, conn.institutionName)}
              />
            </View>
          </View>

          {conn.accounts.map((acct) => (
            <View
              key={acct.accountId}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing.md,
                paddingHorizontal: spacing.base,
                paddingVertical: spacing.sm,
                borderTopWidth: 1,
                borderTopColor: colors.separator,
              }}
            >
              <Text variant="subtext" style={{ flex: 1 }} numberOfLines={1}>
                {acct.name}
                {acct.mask ? ` ····${acct.mask}` : ""}
              </Text>
              <PillButton
                label={acct.linkedCardName ?? "Link card"}
                tone={acct.userCardId ? "soft" : "accent"}
                onPress={() => pickCard(acct.accountId, acct.userCardId)}
              />
            </View>
          ))}
        </Card>
      ))}

      <Button
        label={busy ? "Connecting…" : "+ Connect a card"}
        variant="secondary"
        haptic={false}
        disabled={busy}
        onPress={onConnect}
      />
      <Text variant="caption" color="tertiary" style={{ marginTop: spacing.sm }}>
        Link a card so OfferBee auto-tracks its statement credits from your
        transactions.
      </Text>
    </>
  );
}
