import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useAction, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

import { Button, Icon, Text } from "@/components/ui";
import { fontFamilies, radius, spacing, useTheme } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";
import { LinkPickerSheet, type SheetTarget } from "./LinkPickerSheet";
import type { DetectResult } from "./usePlaidCardLink";

// Post-connect review — "We found your cards"
// (Design/design_handoff_card_add, state 3c). Every successful Plaid connect
// lands here; nothing is added to the wallet or linked until the user
// confirms — no silent auto-add. Behavior mirrors the web review
// (apps/web/src/components/app/DetectedCardsReview.tsx).

// Institution brand colors are CONTENT, not theme tokens — never remapped.
// Duplicated from PlaidConnectSection's (unexported) map since this review
// also shows an institution monogram + card-art chips.
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

// `cardName` is set when the user picks explicitly (the sheet carries the
// name with the key), so display never has to fall back to the raw cardKey
// slug.
type RowState = { checked: boolean; cardKey: string | null; cardName?: string };

// Seed obeys the claim rule too: when two accounts resolve to the same card
// (e.g. primary + authorized-user copies of one product), only the first
// seeds checked — duplicates keep their cardKey unchecked so the user can
// flip which account is linked.
function initialRows(
  accounts: DetectResult["accounts"],
): Record<string, RowState> {
  const rows: Record<string, RowState> = {};
  const seen = new Set<string>();
  for (const a of accounts) {
    const key = a.resolvedCardKey;
    rows[a.accountId] = {
      checked: key !== null && !seen.has(key),
      cardKey: key,
    };
    if (key !== null) seen.add(key);
  }
  return rows;
}

// One card ↔ one account: checking a row claims its cardKey — any other
// checked row holding the same key is unchecked (last pick wins, no dead
// ends). Every path that checks a row (pick, add, toggle) goes through here.
function claimCardKey(
  prev: Record<string, RowState>,
  accountId: string,
  next: RowState,
): Record<string, RowState> {
  const rows = { ...prev, [accountId]: next };
  if (next.checked && next.cardKey) {
    for (const [id, r] of Object.entries(rows)) {
      if (id !== accountId && r.checked && r.cardKey === next.cardKey) {
        rows[id] = { ...r, checked: false };
      }
    }
  }
  return rows;
}

export function DetectedCardsReview({
  result,
  onDone,
}: {
  result: DetectResult;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const { walletCards } = useCredits();
  const connections = useQuery(api.plaid.listConnections);
  const popular = useQuery(api.catalog.popularCards);
  const confirmDetectedCards = useAction(api.plaid.confirmDetectedCards);

  // `result` is stable for the lifetime of this component (parents mount a
  // fresh instance per connect), so seed once from props.
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    initialRows(result.accounts),
  );
  // accountId whose link picker sheet is open — one at a time.
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One card ↔ one account across existing connections — same derivation
  // PlaidConnectSection uses — so wallet cards already linked elsewhere show
  // disabled in the picker.
  const linkedTo = useMemo(() => {
    const map = new Map<string, string>();
    for (const conn of connections ?? [])
      for (const a of conn.accounts)
        if (a.userCardId) map.set(a.userCardId, a.mask ?? "");
    return map;
  }, [connections]);

  // "Add new" scoping: the connected institution's issuer only, falling back
  // to the full list — same logic as PlaidConnectSection's catalogGroupsFor.
  const catalogGroups = useMemo(() => {
    const groups = popular ?? [];
    const institutionName = result.institutionName;
    if (!institutionName) return groups;
    const inst = institutionName.toLowerCase();
    const matched = groups.filter((g) => inst.includes(g.issuer.toLowerCase()));
    return matched.length > 0 ? matched : groups;
  }, [popular, result.institutionName]);

  // cardKey → display name for rows: catalog name first, wallet name (which
  // may carry a user nickname) wins when the card is already owned.
  const nameForCardKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of popular ?? [])
      for (const c of g.cards) map.set(c.cardKey, c.cardName);
    for (const c of walletCards) map.set(c.cardKey, c.name);
    return map;
  }, [popular, walletCards]);

  const setRowCardKey = (
    accountId: string,
    cardKey: string,
    cardName?: string,
  ) => {
    setRows((prev) =>
      claimCardKey(prev, accountId, { checked: true, cardKey, cardName }),
    );
    setPickFor(null);
  };

  const toggleChecked = (accountId: string) => {
    setRows((prev) => {
      const row = prev[accountId];
      if (!row?.cardKey) return prev; // disabled until the row has a cardKey
      return claimCardKey(prev, accountId, { ...row, checked: !row.checked });
    });
  };

  const selections = Object.entries(rows)
    .filter(([, r]) => r.checked && r.cardKey)
    .map(([accountId, r]) => ({ accountId, cardKey: r.cardKey as string }));

  const confirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      await confirmDetectedCards({ itemId: result.itemId, selections });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add cards");
      setConfirming(false);
    }
  };

  const institutionName = result.institutionName ?? "Your bank";
  const count = result.accounts.length;

  // The sheet targeting the row being resolved (showNotLinked=false — every
  // row here needs a card).
  const pickAcct =
    result.accounts.find((a) => a.accountId === pickFor) ?? null;
  const pickRow = pickAcct ? rows[pickAcct.accountId] : undefined;
  const sheetTarget: SheetTarget | null = pickAcct
    ? {
        accountId: pickAcct.accountId,
        mask: pickAcct.mask ?? null,
        institutionName,
        currentCardId:
          (pickRow?.cardKey &&
            walletCards.find((c) => c.cardKey === pickRow.cardKey)
              ?.userCardId) ||
          null,
      }
    : null;

  return (
    <>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: 4, paddingBottom: 12 }}>
        <Text
          style={{
            fontFamily: fontFamilies.display,
            fontSize: 22,
            color: colors.ink,
          }}
        >
          We found your cards
        </Text>
        <Text variant="subtext" color="secondary" style={{ marginTop: 4 }}>
          Confirm what goes in your wallet — nothing is added without you.
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
                backgroundColor: institutionColor(institutionName),
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
                {institutionName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="body">{institutionName}</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 1 }}>
                {count} credit card{count === 1 ? "" : "s"} found
              </Text>
            </View>
          </View>

          {result.accounts.map((acct, i) => {
            const row = rows[acct.accountId] ?? { checked: false, cardKey: null };
            const ambiguous = acct.resolvedCardKey === null;

            // Unresolved — the bank didn't say which card this is. Warning
            // chip treatment (like PlaidConnectSection's "Not linked" chip).
            if (ambiguous && !row.cardKey) {
              return (
                <Pressable
                  key={acct.accountId}
                  onPress={() => setPickFor(acct.accountId)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    marginHorizontal: 12,
                    marginVertical: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    borderRadius: 12,
                    backgroundColor: colors.warningSoft,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 1.5,
                      borderColor: colors.warning,
                      opacity: 0.55,
                    }}
                  />
                  <View
                    style={{
                      width: 36,
                      height: 24,
                      borderRadius: 4,
                      borderWidth: 1.5,
                      borderStyle: "dashed",
                      borderColor: colors.warning,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fontFamilies.textSemiBold,
                        fontSize: 13,
                        color: colors.warning,
                      }}
                    >
                      ?
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "baseline",
                        gap: 8,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          flexShrink: 1,
                          fontFamily: fontFamilies.textSemiBold,
                          fontSize: 14.5,
                          color: colors.warning,
                        }}
                      >
                        {acct.name ?? acct.officialName ?? "Credit card"}
                      </Text>
                      {acct.mask ? (
                        <Text
                          style={{
                            fontFamily: fontFamilies.monoMedium,
                            fontSize: 12,
                            color: colors.warning,
                          }}
                        >
                          ····{acct.mask}
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      style={{
                        fontFamily: fontFamilies.textMedium,
                        fontSize: 12.5,
                        color: colors.warning,
                        marginTop: 1,
                      }}
                    >
                      Choose which card →
                    </Text>
                  </View>
                </Pressable>
              );
            }

            // Resolved — either matched automatically or picked via the sheet.
            // Never show the raw cardKey slug: user-picked name, then catalog
            // name, then the bank-reported name while the catalog loads.
            const displayName =
              row.cardName ??
              (row.cardKey ? nameForCardKey.get(row.cardKey) : undefined) ??
              acct.name ??
              acct.officialName ??
              "Credit card";

            return (
              <View
                key={acct.accountId}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: spacing.base,
                  paddingVertical: 13,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.separator,
                }}
              >
                <Pressable
                  disabled={!row.cardKey}
                  onPress={() => toggleChecked(acct.accountId)}
                  hitSlop={8}
                  accessibilityLabel={
                    row.checked ? "Exclude this card" : "Include this card"
                  }
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: row.checked ? colors.accent : "transparent",
                    borderWidth: row.checked ? 0 : 1.5,
                    borderColor: colors.border,
                    opacity: row.cardKey ? 1 : 0.5,
                  }}
                >
                  {row.checked && (
                    <Icon name="check" size={12} color="onAccent" />
                  )}
                </Pressable>
                <View
                  style={{
                    width: 36,
                    height: 24,
                    borderRadius: 4,
                    backgroundColor: institutionColor(institutionName),
                  }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "baseline",
                      gap: 8,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        flexShrink: 1,
                        fontFamily: fontFamilies.textSemiBold,
                        fontSize: 14.5,
                        color: colors.ink,
                      }}
                    >
                      {displayName}
                    </Text>
                    {acct.mask ? (
                      <Text
                        style={{
                          fontFamily: fontFamilies.monoMedium,
                          fontSize: 12,
                          color: colors.tertiary,
                        }}
                      >
                        ····{acct.mask}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {ambiguous ? (
                  <Pressable
                    onPress={() => setPickFor(acct.accountId)}
                    hitSlop={8}
                  >
                    <Text
                      style={{
                        fontFamily: fontFamilies.textSemiBold,
                        fontSize: 13,
                        color: colors.secondary,
                      }}
                    >
                      Choose which card →
                    </Text>
                  </Pressable>
                ) : (
                  <Text
                    style={{
                      fontFamily: fontFamilies.monoMedium,
                      fontSize: 10,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      color: colors.tertiary,
                    }}
                  >
                    Matched
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
        <Button
          label={
            confirming
              ? "Adding…"
              : `Add ${selections.length} card${selections.length === 1 ? "" : "s"}`
          }
          haptic={false}
          disabled={confirming || selections.length === 0}
          onPress={() => void confirm()}
        />
        <Text
          variant="caption"
          color="secondary"
          style={{ textAlign: "center", marginTop: spacing.sm, paddingHorizontal: 12 }}
        >
          Uncheck anything you don&apos;t want. You can link the rest later in
          Settings.
        </Text>
        {error && (
          <Text
            style={{
              fontFamily: fontFamilies.textMedium,
              fontSize: 13,
              color: colors.alert,
              textAlign: "center",
              marginTop: spacing.sm,
            }}
          >
            {error}
          </Text>
        )}
        <Pressable
          disabled={confirming}
          onPress={onDone}
          hitSlop={8}
          style={{ alignItems: "center", marginTop: spacing.md }}
        >
          <Text
            style={{
              fontFamily: fontFamilies.textSemiBold,
              fontSize: 13.5,
              color: colors.secondary,
              opacity: confirming ? 0.5 : 1,
            }}
          >
            Skip for now
          </Text>
        </Pressable>
      </View>

      {/* Picker for ambiguous rows — picks stay local (claim rule) until the
          user confirms; nothing hits the server from here. */}
      <LinkPickerSheet
        target={sheetTarget}
        walletCards={walletCards}
        linkedTo={linkedTo}
        catalogGroups={catalogGroups}
        picking={false}
        showNotLinked={false}
        onSetLink={(userCardId) => {
          if (!pickAcct) return;
          const card = walletCards.find((c) => c.userCardId === userCardId);
          if (card) setRowCardKey(pickAcct.accountId, card.cardKey, card.name);
        }}
        onAddLink={(cardKey, cardName) => {
          if (!pickAcct) return;
          setRowCardKey(pickAcct.accountId, cardKey, cardName);
        }}
        onClose={() => setPickFor(null)}
      />
    </>
  );
}
