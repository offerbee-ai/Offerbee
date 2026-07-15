import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  createPlaidLinkSession,
  type LinkSuccess,
} from "react-native-plaid-link-sdk";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

import { Button, Card, Icon, SearchField, SectionLabel, Text } from "@/components/ui";
import { fontFamilies, radius, spacing, useTheme } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";

// Native "Connected accounts" — Plaid Link connect + per-account → wallet-card
// linking (Design/design_handoff_connected_accounts, states 1d–1f). The link
// picker is a bottom sheet; it also opens right after a connect for each
// account the backend couldn't auto-resolve (e.g. Chase reports every UR card
// as "Ultimate Rewards®"). Requires a dev client (Plaid's native module isn't
// in Expo Go).

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

// The account the link sheet is targeting.
type SheetTarget = {
  accountId: string;
  mask: string | null;
  institutionName: string;
  currentCardId: string | null;
};

type CatalogResult = { cardKey: string; cardName: string; cardIssuer: string };

export function PlaidConnectSection() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const configured = useQuery(api.plaid.plaidConfigured);
  const connections = useQuery(api.plaid.listConnections);
  const popular = useQuery(api.catalog.popularCards);
  const { walletCards } = useCredits();
  const createLinkToken = useAction(api.plaid.createLinkToken);
  const exchange = useAction(api.plaid.exchangePublicToken);
  const linkAccount = useMutation(api.plaid.linkAccountToCard);
  const linkCatalogCard = useAction(api.plaid.linkAccountToCatalogCard);
  const removeConnection = useAction(api.plaid.removeConnection);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  // Post-connect prompts for accounts the backend couldn't auto-resolve.
  const [queue, setQueue] = useState<SheetTarget[]>([]);

  const target = sheet ?? queue[0] ?? null;
  const fromQueue = !sheet && queue.length > 0;
  const closeSheet = () => {
    if (fromQueue) setQueue((q) => q.slice(1));
    else setSheet(null);
  };

  // Search-any-card: instant local-catalog hits + a debounced live API search
  // (the add-card screen's hybrid pattern), so cards outside the popular list
  // are linkable here without a detour through the wallet.
  const [term, setTerm] = useState("");
  const [apiResults, setApiResults] = useState<CatalogResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchCards = useAction(api.rapidapi.searchCards);
  const reqId = useRef(0);

  const trimmed = term.trim();
  const searchActive = trimmed.length >= 2;
  const localResults = useQuery(
    api.catalog.searchCatalogLocal,
    searchActive ? { term: trimmed } : "skip",
  );

  // The sheet stays mounted across opens — clear the search per target account.
  const targetAccountId = target?.accountId ?? null;
  useEffect(() => {
    setTerm("");
  }, [targetAccountId]);

  useEffect(() => {
    if (trimmed.length < 2) {
      setApiResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    const id = ++reqId.current;
    setApiResults([]);
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await searchCards({ term: trimmed });
        if (id === reqId.current) {
          setApiResults(r);
          setSearched(true);
        }
      } catch {
        if (id === reqId.current) setSearched(true);
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [trimmed, searchCards]);

  // Owned cards are pickable in the wallet section above — drop them from
  // search results instead of offering a second "add" path to the same card.
  const ownedKeys = useMemo(
    () => new Set(walletCards.map((c) => c.cardKey)),
    [walletCards],
  );
  const searchResults = useMemo(() => {
    const map = new Map<string, CatalogResult>();
    for (const r of localResults ?? []) map.set(r.cardKey, r);
    for (const r of apiResults) map.set(r.cardKey, r);
    return Array.from(map.values()).filter((r) => !ownedKeys.has(r.cardKey));
  }, [localResults, apiResults, ownedKeys]);

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
            const institutionName =
              success.metadata?.institution?.name ?? "Your bank";
            const res = await exchange({
              publicToken: success.publicToken,
              institutionId: success.metadata?.institution?.id,
              institutionName,
            });
            setQueue(
              res.accounts
                .filter((a) => !a.linked && isCreditAccount(a.subtype))
                .map((a) => ({
                  accountId: a.accountId,
                  mask: a.mask ?? null,
                  institutionName,
                  currentCardId: null,
                })),
            );
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

  const setLink = async (accountId: string, userCardId: string | null) => {
    setPicking(true);
    try {
      await linkAccount({
        accountId,
        userCardId: userCardId as Id<"userCards"> | null,
      });
      closeSheet();
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
      closeSheet();
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

  const monoLabel = (label: string) => (
    <Text
      style={{
        fontFamily: fontFamilies.monoMedium,
        fontSize: 10,
        letterSpacing: 0.7,
        textTransform: "uppercase",
        color: colors.tertiary,
        paddingHorizontal: spacing.base,
        paddingTop: spacing.md,
        paddingBottom: 6,
      }}
    >
      {label}
    </Text>
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
            disabled={busy}
            onPress={onConnect}
            style={{ alignSelf: "stretch", marginTop: 18 }}
          />
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
                <Text variant="caption" color="secondary" style={{ marginTop: 1 }}>
                  {conn.status === "login_required"
                    ? "Reconnect needed"
                    : conn.status === "error"
                      ? "Connection error"
                      : `${creditAccounts.length} account${creditAccounts.length === 1 ? "" : "s"} · connected ${connectedOn(conn.connectedAt)}`}
                </Text>
              </View>
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
        disabled={busy}
        onPress={onConnect}
      />
      <Text
        variant="caption"
        color="secondary"
        style={{ textAlign: "center", marginTop: spacing.sm, paddingHorizontal: 12 }}
      >
        Link a card so OfferBee can auto-track its statement credits from your
        transactions.
      </Text>

      {/* ── 1f · Link picker bottom sheet ─────────────────────────────────── */}
      <Modal
        visible={target !== null}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.42)",
            }}
            onPress={closeSheet}
          />
          {target && (
            <View
              style={{
                backgroundColor: colors.background,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                paddingBottom: 22 + insets.bottom,
                maxHeight: "82%",
              }}
            >
              {/* Grabber */}
              <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.track,
                  }}
                />
              </View>
              <View style={{ alignItems: "center", paddingTop: 4, paddingBottom: 12, paddingHorizontal: 20 }}>
                <Text
                  style={{
                    fontFamily: fontFamilies.display,
                    fontSize: 17,
                    color: colors.ink,
                  }}
                >
                  Link credit card{target.mask ? ` ····${target.mask}` : ""}
                </Text>
                <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
                  {target.institutionName} · transactions will auto-track this
                  card&apos;s credits
                </Text>
              </View>

              <ScrollView style={{ flexGrow: 0 }}>
                <View
                  style={{
                    marginHorizontal: spacing.base,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.card,
                    overflow: "hidden",
                  }}
                >
                  {/* Not linked */}
                  <Pressable
                    disabled={picking}
                    onPress={() => void setLink(target.accountId, null)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingHorizontal: spacing.base,
                      paddingVertical: 13,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.separator,
                    }}
                  >
                    {!target.currentCardId ? (
                      <Icon name="check" size={15} color="accent" />
                    ) : (
                      <View style={{ width: 15 }} />
                    )}
                    <Text variant="body" style={{ fontSize: 14.5 }}>
                      Not linked
                    </Text>
                  </Pressable>

                  {/* Your wallet */}
                  {walletCards.length > 0 && (
                    <>
                      {monoLabel("Your wallet")}
                      {walletCards.map((c) => {
                        const current = target.currentCardId === c.userCardId;
                        const elsewhere =
                          !current && linkedTo.has(c.userCardId);
                        return (
                          <Pressable
                            key={c.userCardId}
                            disabled={picking || elsewhere}
                            onPress={() =>
                              void setLink(target.accountId, c.userCardId)
                            }
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              paddingLeft: current ? spacing.base : 41,
                              paddingRight: spacing.base,
                              paddingVertical: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: colors.separator,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 10,
                                flexShrink: 1,
                              }}
                            >
                              {current && (
                                <Icon name="check" size={15} color="accent" />
                              )}
                              <Text
                                variant="subtext"
                                numberOfLines={1}
                                style={{
                                  fontSize: 14.5,
                                  color: elsewhere
                                    ? colors.tertiary
                                    : colors.ink,
                                }}
                              >
                                {c.name}
                              </Text>
                            </View>
                            {elsewhere && (
                              <Text
                                style={{
                                  fontFamily: fontFamilies.monoMedium,
                                  fontSize: 9.5,
                                  letterSpacing: 0.5,
                                  textTransform: "uppercase",
                                  color: colors.tertiary,
                                }}
                              >
                                Linked ····{linkedTo.get(c.userCardId)}
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </>
                  )}

                  {/* Add new: search the full catalog, or browse the issuer's
                      popular cards while the input is empty. */}
                  <View
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingTop: spacing.md,
                    }}
                  >
                    <SearchField
                      value={term}
                      onChangeText={setTerm}
                      placeholder="Search any card…"
                    />
                  </View>

                  {searchActive ? (
                    <View>
                      {monoLabel("Add new — search")}
                      {searchResults.map((c, i) => (
                        <Pressable
                          key={c.cardKey}
                          disabled={picking}
                          onPress={() =>
                            void addAndLink(target.accountId, c.cardKey)
                          }
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                            paddingHorizontal: spacing.base,
                            paddingVertical: 12,
                            borderBottomWidth:
                              i === searchResults.length - 1 ? 0 : 1,
                            borderBottomColor: colors.separator,
                          }}
                        >
                          <Icon name="plus" size={15} color="accent" />
                          <View style={{ flexShrink: 1 }}>
                            <Text variant="body" style={{ fontSize: 14.5 }}>
                              {c.cardName}
                            </Text>
                            <Text
                              variant="caption"
                              color="secondary"
                              numberOfLines={1}
                              style={{ marginTop: 1 }}
                            >
                              {c.cardIssuer} · adds this card to your wallet
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                      {searchResults.length === 0 && (
                        <Text
                          variant="subtext"
                          color="secondary"
                          style={{
                            paddingHorizontal: spacing.base,
                            paddingVertical: 12,
                          }}
                        >
                          {searching || localResults === undefined
                            ? "Searching…"
                            : searched
                              ? "No matches — try a different card name."
                              : "Searching…"}
                        </Text>
                      )}
                    </View>
                  ) : (
                    catalogGroupsFor(target.institutionName).map((g) => {
                      const notOwned = g.cards.filter((c) => !c.owned);
                      if (notOwned.length === 0) return null;
                      return (
                        <View key={g.issuer}>
                          {monoLabel(`Add new — ${g.issuer}`)}
                          {notOwned.map((c, i) => (
                            <Pressable
                              key={c.cardKey}
                              disabled={picking}
                              onPress={() =>
                                void addAndLink(target.accountId, c.cardKey)
                              }
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 10,
                                paddingHorizontal: spacing.base,
                                paddingVertical: 12,
                                borderBottomWidth: i === notOwned.length - 1 ? 0 : 1,
                                borderBottomColor: colors.separator,
                              }}
                            >
                              <Icon name="plus" size={15} color="accent" />
                              <View style={{ flexShrink: 1 }}>
                                <Text variant="body" style={{ fontSize: 14.5 }}>
                                  {c.cardName}
                                </Text>
                                <Text
                                  variant="caption"
                                  color="secondary"
                                  style={{ marginTop: 1 }}
                                >
                                  Adds this card to your wallet
                                </Text>
                              </View>
                            </Pressable>
                          ))}
                        </View>
                      );
                    })
                  )}
                </View>
              </ScrollView>

              {/* Cancel */}
              <Pressable
                disabled={picking}
                onPress={closeSheet}
                style={{
                  marginHorizontal: spacing.base,
                  marginTop: spacing.md,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 14,
                  alignItems: "center",
                  paddingVertical: 13,
                }}
              >
                <Text
                  style={{
                    fontFamily: fontFamilies.textSemiBold,
                    fontSize: 15,
                    color: colors.accent,
                  }}
                >
                  {fromQueue ? "Not sure — skip for now" : "Cancel"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}
