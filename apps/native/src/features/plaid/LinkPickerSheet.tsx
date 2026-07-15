import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAction, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

import { Icon, SearchField, Text } from "@/components/ui";
import { fontFamilies, radius, spacing, useTheme } from "@/theme";

// Bottom-sheet link picker (Design/design_handoff_connected_accounts, 1f) —
// extracted from PlaidConnectSection so the detected-cards review can reuse
// it. Groups: Not linked (optional) / Your wallet / Add new (issuer-scoped
// browse + any-card search).

// The account the link sheet is targeting.
export type SheetTarget = {
  accountId: string;
  mask: string | null;
  institutionName: string;
  currentCardId: string | null;
};

type CatalogResult = { cardKey: string; cardName: string; cardIssuer: string };

export function LinkPickerSheet({
  target,
  walletCards,
  linkedTo,
  catalogGroups,
  picking,
  showNotLinked = true,
  onSetLink,
  onAddLink,
  onClose,
}: {
  target: SheetTarget | null; // null → hidden
  walletCards: { userCardId: string; name: string; cardKey: string }[];
  linkedTo: Map<string, string>; // userCardId → mask (linked elsewhere)
  catalogGroups: {
    issuer: string;
    cards: { cardKey: string; cardName: string; owned: boolean }[];
  }[];
  picking: boolean;
  showNotLinked?: boolean; // default true; false from the review
  onSetLink: (userCardId: string | null) => void;
  onAddLink: (cardKey: string, cardName?: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

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

  return (
    <Modal
      visible={target !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
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
          onPress={onClose}
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

            {/* keyboardShouldPersistTaps: the first tap on a search result
                should select it, not just dismiss the keyboard. */}
            <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
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
                {showNotLinked && (
                  <Pressable
                    disabled={picking}
                    onPress={() => onSetLink(null)}
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
                )}

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
                          onPress={() => onSetLink(c.userCardId)}
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
                        onPress={() => onAddLink(c.cardKey, c.cardName)}
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
                  catalogGroups.map((g) => {
                    const notOwned = g.cards.filter((c) => !c.owned);
                    if (notOwned.length === 0) return null;
                    return (
                      <View key={g.issuer}>
                        {monoLabel(`Add new — ${g.issuer}`)}
                        {notOwned.map((c, i) => (
                          <Pressable
                            key={c.cardKey}
                            disabled={picking}
                            onPress={() => onAddLink(c.cardKey, c.cardName)}
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
              onPress={onClose}
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
                Cancel
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}
