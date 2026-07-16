import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, View } from "react-native";
import { createPlaidLinkSession } from "react-native-plaid-link-sdk";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

import { Button, Card, Icon, SectionLabel, Text } from "@/components/ui";
import { fontFamilies, spacing, useTheme } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";
import {
  isPlaidAvailable,
  usePlaidCardLink,
  type DetectResult,
} from "./usePlaidCardLink";
import { LinkPickerSheet, type SheetTarget } from "./LinkPickerSheet";
import { DetectedCardsReview } from "./DetectedCardsReview";

// Native "Connected accounts" — Plaid Link connect + per-account → wallet-card
// linking (Design/design_handoff_connected_accounts, states 1d–1f). A
// successful connect opens the detected-cards review ("We found your cards");
// the link picker bottom sheet handles per-account relinking from the rows
// below. Requires a dev client (Plaid's native module isn't in Expo Go).

// Institution brand colors are CONTENT, not theme tokens — never remapped.
const INSTITUTION_COLORS: [RegExp, string][] = [
  [/chase/i, "#0E4C96"],
  [/american express|amex/i, "#016FD0"],
  [/bank of america/i, "#E31837"],
  [/citi/i, "#056DAE"],
  [/capital one/i, "#004977"],
  [/wells fargo/i, "#D71E28"],
  [/discover/i, "#FF6000"],
  [/u\.?s\.? bank/i, "#0C2074"],
];
const institutionColor = (name: string) =>
  INSTITUTION_COLORS.find(([re]) => re.test(name))?.[1] ?? "#6F6757";

// Only credit-card accounts are shown (checking/savings filtered out).
const isCreditAccount = (subtype: string | null | undefined) =>
  !subtype || /credit/i.test(subtype);

const connectedOn = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Compact relative timestamp for the "updated …" status line. (Duplicated from
// web PlaidConnect — same convention as the credits derive logic.)
function timeAgo(ts: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function PlaidConnectSection() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const configured = useQuery(api.plaid.plaidConfigured);
  const connections = useQuery(api.plaid.listConnections);
  const popular = useQuery(api.catalog.popularCards);
  const { walletCards } = useCredits();
  const createUpdateLinkToken = useAction(api.plaid.createUpdateLinkToken);
  const reactivate = useMutation(api.plaid.reactivateItem);
  const linkAccount = useMutation(api.plaid.linkAccountToCard);
  const linkCatalogCard = useAction(api.plaid.linkAccountToCatalogCard);
  const removeConnection = useAction(api.plaid.removeConnection);
  const refresh = useAction(api.plaid.refreshConnection);
  // Set while re-authenticating an existing item (Plaid Link update mode) —
  // separate from the connect flow's `busy` (owned by usePlaidCardLink).
  const [reauthBusy, setReauthBusy] = useState(false);
  // Per-connection manual refresh + cooldown. `now` re-renders once when the
  // earliest cooldown expires so the button re-enables without a remount.
  const [refreshingItem, setRefreshingItem] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const cooldowns = (connections ?? [])
      .map((c) => c.nextRefreshAt)
      .filter((t): t is number => t != null && t > now);
    if (cooldowns.length === 0) return;
    const t = setTimeout(
      () => setNow(Date.now()),
      Math.min(...cooldowns) - now + 1000,
    );
    return () => clearTimeout(t);
  }, [connections, now]);
  const [picking, setPicking] = useState(false);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  // Post-connect review ("We found your cards") — replaces the old
  // per-account prompt queue.
  const [reviewResult, setReviewResult] = useState<DetectResult | null>(null);

  const { startConnect, busy } = usePlaidCardLink({
    onDetected: (result) => {
      if (result.accounts.length === 0) {
        Alert.alert(
          "No credit cards found",
          "Accounts other than credit cards aren't tracked.",
        );
        return;
      }
      setReviewResult(result);
    },
    onFail: (reason, message) => {
      // Plain user cancel stays silent.
      if (reason === "error") Alert.alert("Couldn't connect", message ?? "");
    },
  });

  // Re-authenticate an existing connection (Plaid Link update mode): its
  // onSuccess reactivates the item in place — never a public-token exchange.
  const onReauth = async (itemId: string) => {
    setReauthBusy(true);
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
      setReauthBusy(false);
    }
  };

  const onRefresh = async (itemId: string) => {
    setRefreshingItem(itemId);
    try {
      await refresh({ itemId });
    } catch (e) {
      Alert.alert("Refresh failed", String(e));
    } finally {
      setRefreshingItem(null);
    }
  };

  const setLink = async (accountId: string, userCardId: string | null) => {
    setPicking(true);
    try {
      await linkAccount({
        accountId,
        userCardId: userCardId as Id<"userCards"> | null,
      });
      setSheet(null);
    } catch (e) {
      Alert.alert("Couldn't link card", String(e));
    } finally {
      setPicking(false);
    }
  };

  const addAndLink = async (accountId: string, cardKey: string) => {
    setPicking(true);
    try {
      await linkCatalogCard({ accountId, cardKey });
      setSheet(null);
    } catch (e) {
      Alert.alert("Couldn't link card", String(e));
    } finally {
      setPicking(false);
    }
  };

  const onDisconnect = (itemId: string, name: string, linkedCount: number) => {
    Alert.alert(
      `Disconnect ${name}?`,
      `Auto-tracking stops for ${linkedCount} linked card${linkedCount === 1 ? "" : "s"}. Your wallet cards and history stay.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => void removeConnection({ itemId }),
        },
      ],
    );
  };

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

  if (connections === undefined) return null;

  // One card ↔ one account, across every connection — already-linked wallet
  // cards are disabled in the picker with a pointer to their account.
  const linkedTo = new Map<string, string>();
  for (const conn of connections)
    for (const a of conn.accounts)
      if (a.userCardId) linkedTo.set(a.userCardId, a.mask ?? "");

  // "Add new" scoping: the connected institution's issuer only; an institution
  // missing from the catalog falls back to the full list.
  const catalogGroupsFor = (institutionName: string) => {
    const groups = popular ?? [];
    const inst = institutionName.toLowerCase();
    const matched = groups.filter((g) =>
      inst.includes(g.issuer.toLowerCase()),
    );
    return matched.length > 0 ? matched : groups;
  };

  // Shared by the empty and connected branches: the settings-row link picker
  // and the post-connect review (same bottom-sheet presentation).
  const modals = (
    <>
      {/* ── 1f · Link picker bottom sheet ─────────────────────────────────── */}
      <LinkPickerSheet
        target={sheet}
        walletCards={walletCards}
        linkedTo={linkedTo}
        catalogGroups={sheet ? catalogGroupsFor(sheet.institutionName) : []}
        picking={picking}
        onSetLink={(userCardId) => {
          if (sheet) void setLink(sheet.accountId, userCardId);
        }}
        onAddLink={(cardKey) => {
          if (sheet) void addAndLink(sheet.accountId, cardKey);
        }}
        onClose={() => setSheet(null)}
      />

      {/* ── 3c · Detected-cards review ────────────────────────────────────── */}
      {/* Non-dismissable (matches web): the DetectResult is ephemeral, so a
          backdrop mis-tap or Android back would discard in-progress picks
          irrecoverably. "Skip for now" inside the review is the single
          explicit escape. */}
      <Modal
        visible={reviewResult !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {}}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.42)",
            }}
          />
          {reviewResult && (
            <View
              style={{
                backgroundColor: colors.background,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                paddingBottom: 22 + insets.bottom,
                maxHeight: "88%",
              }}
            >
              {/* Grabber */}
              <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 8 }}>
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.track,
                  }}
                />
              </View>
              <DetectedCardsReview
                result={reviewResult}
                onDone={() => setReviewResult(null)}
              />
            </View>
          )}
        </View>
      </Modal>
    </>
  );

  // ── 1d · Empty state ────────────────────────────────────────────────────────
  if (connections.length === 0) {
    return (
      <>
        <SectionLabel>Connected accounts</SectionLabel>
        <Card style={{ alignItems: "center", paddingVertical: 32, paddingHorizontal: 24 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="link" size={20} color="accent" />
          </View>
          <Text
            style={{
              fontFamily: fontFamilies.display,
              fontSize: 18,
              color: colors.ink,
              marginTop: 13,
            }}
          >
            Nothing connected yet
          </Text>
          <Text
            variant="subtext"
            color="secondary"
            style={{ textAlign: "center", marginTop: 6, lineHeight: 20 }}
          >
            Connect a card account and OfferBee will auto-track its statement
            credits for you.
          </Text>
          <Button
            label={busy ? "Connecting…" : "+ Connect a card"}
            haptic={false}
            disabled={busy || !isPlaidAvailable}
            onPress={startConnect}
            style={{ alignSelf: "stretch", marginTop: 18 }}
          />
          {!isPlaidAvailable && (
            <Text
              variant="caption"
              color="secondary"
              style={{ textAlign: "center", marginTop: 8 }}
            >
              Connecting a bank needs a development build (not Expo Go).
            </Text>
          )}
          <Text
            style={{
              fontFamily: fontFamilies.monoMedium,
              fontSize: 9.5,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: colors.tertiary,
              marginTop: 13,
            }}
          >
            Read-only access · Disconnect anytime
          </Text>
        </Card>
        {modals}
      </>
    );
  }

  // ── 1e · Connected ──────────────────────────────────────────────────────────
  return (
    <>
      <SectionLabel>Connected accounts</SectionLabel>

      {connections.map((conn) => {
        const creditAccounts = conn.accounts.filter((a) =>
          isCreditAccount(a.subtype),
        );
        const linkedCount = creditAccounts.filter((a) => a.userCardId).length;
        return (
          <Card key={conn.itemId} padded={false} style={{ marginBottom: spacing.md }}>
            {/* Institution header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: spacing.base,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.separator,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  backgroundColor: institutionColor(conn.institutionName),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: fontFamilies.display,
                    fontSize: 16,
                    color: "#FFFFFF",
                  }}
                >
                  {conn.institutionName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="body">{conn.institutionName}</Text>
                <Text
                  variant="caption"
                  color={conn.status === "active" ? "secondary" : "alert"}
                  style={{ marginTop: 1 }}
                >
                  {conn.status === "login_required"
                    ? "Reconnect needed"
                    : conn.status === "error"
                      ? "Connection error"
                      : `${creditAccounts.length} account${creditAccounts.length === 1 ? "" : "s"} · connected ${connectedOn(conn.connectedAt)}${
                          conn.lastSyncedAt
                            ? ` · updated ${timeAgo(conn.lastSyncedAt)}`
                            : ""
                        }`}
                </Text>
              </View>
              {conn.status === "active" ? (
                (() => {
                  const cooling =
                    conn.nextRefreshAt != null && conn.nextRefreshAt > now;
                  const disabled = refreshingItem === conn.itemId || cooling;
                  return (
                    <Pressable
                      onPress={() => void onRefresh(conn.itemId)}
                      disabled={disabled}
                      hitSlop={8}
                    >
                      <Text
                        style={{
                          fontFamily: fontFamilies.textSemiBold,
                          fontSize: 12.5,
                          color: colors.accent,
                          opacity: disabled ? 0.45 : 1,
                        }}
                      >
                        {refreshingItem === conn.itemId
                          ? "Refreshing…"
                          : "Refresh"}
                      </Text>
                    </Pressable>
                  );
                })()
              ) : (
                <Pressable
                  onPress={() => void onReauth(conn.itemId)}
                  disabled={busy || reauthBusy || !isPlaidAvailable}
                  hitSlop={8}
                >
                  <Text
                    style={{
                      fontFamily: fontFamilies.textSemiBold,
                      fontSize: 12.5,
                      color: colors.accent,
                      opacity: busy || reauthBusy || !isPlaidAvailable ? 0.5 : 1,
                    }}
                  >
                    Reconnect
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() =>
                  onDisconnect(conn.itemId, conn.institutionName, linkedCount)
                }
                hitSlop={8}
              >
                <Text
                  style={{
                    fontFamily: fontFamilies.textSemiBold,
                    fontSize: 12.5,
                    color: colors.alert,
                  }}
                >
                  Disconnect
                </Text>
              </Pressable>
            </View>

            {/* Account rows */}
            {creditAccounts.map((acct, i) => (
              <Pressable
                key={acct.accountId}
                onPress={() =>
                  setSheet({
                    accountId: acct.accountId,
                    mask: acct.mask,
                    institutionName: conn.institutionName,
                    currentCardId: acct.userCardId,
                  })
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingLeft: spacing.base,
                  paddingRight: 14,
                  paddingVertical: 13,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.separator,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="body" style={{ fontSize: 14.5 }}>
                    Credit card
                  </Text>
                  {acct.mask ? (
                    <Text
                      style={{
                        fontFamily: fontFamilies.monoMedium,
                        fontSize: 12,
                        color: colors.tertiary,
                        marginTop: 1,
                      }}
                    >
                      ····{acct.mask}
                    </Text>
                  ) : null}
                </View>
                {acct.userCardId ? (
                  <Text
                    variant="subtext"
                    style={{ textAlign: "right", flexShrink: 1 }}
                    numberOfLines={1}
                  >
                    {acct.linkedCardName}
                  </Text>
                ) : (
                  <View
                    style={{
                      backgroundColor: colors.warningSoft,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fontFamilies.textMedium,
                        fontSize: 13,
                        color: colors.warning,
                      }}
                    >
                      Not linked
                    </Text>
                  </View>
                )}
                <Icon name="chevronDown" size={13} color="tertiary" />
              </Pressable>
            ))}
          </Card>
        );
      })}

      <Button
        label={busy ? "Connecting…" : "+ Connect a card"}
        haptic={false}
        disabled={busy || !isPlaidAvailable}
        onPress={startConnect}
      />
      <Text
        variant="caption"
        color="secondary"
        style={{ textAlign: "center", marginTop: spacing.sm, paddingHorizontal: 12 }}
      >
        {isPlaidAvailable
          ? "Link a card so OfferBee can auto-track its statement credits from your transactions."
          : "Connecting a bank needs a development build (not Expo Go)."}
      </Text>

      {modals}
    </>
  );
}
