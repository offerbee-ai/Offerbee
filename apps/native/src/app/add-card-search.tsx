import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

import {
  Card,
  CardArt,
  Chip,
  EmptyState,
  IconButton,
  ListRow,
  PillButton,
  Screen,
  SearchField,
  SectionLabel,
  Skeleton,
  Text,
} from "@/components/ui";
import { spacing } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";
import { usd } from "@/features/credits/derive";

type SearchResult = { cardKey: string; cardName: string; cardIssuer: string };

export default function AddCardScreen() {
  const [term, setTerm] = useState("");
  const [issuerFilter, setIssuerFilter] = useState<string | null>(null);
  const [apiResults, setApiResults] = useState<SearchResult[]>([]);
  const [apiSearching, setApiSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const { walletCards } = useCredits();
  const popular = useQuery(api.catalog.popularCards);
  const trimmed = term.trim();
  const localResults = useQuery(
    api.catalog.searchCatalogLocal,
    trimmed.length >= 2 ? { term: trimmed } : "skip",
  );
  const searchApi = useAction(api.rapidapi.searchCards);
  const addCard = useMutation(api.wallet.addCard);

  const ownedKeys = useMemo(() => new Set(walletCards.map((c) => c.cardKey)), [walletCards]);

  useEffect(() => {
    setApiResults([]);
    if (trimmed.length < 2) return;
    setApiSearching(true);
    const t = setTimeout(() => {
      searchApi({ term: trimmed })
        .then((results) => setApiResults(results))
        .catch(() => {})
        .finally(() => setApiSearching(false));
    }, 600);
    return () => {
      clearTimeout(t);
      setApiSearching(false);
    };
  }, [trimmed, searchApi]);

  const searchResults = useMemo<SearchResult[]>(() => {
    const seen = new Set<string>();
    const merged: SearchResult[] = [];
    for (const r of [...(localResults ?? []), ...apiResults]) {
      if (seen.has(r.cardKey)) continue;
      seen.add(r.cardKey);
      merged.push(r);
    }
    return merged;
  }, [localResults, apiResults]);

  const onAdd = async (cardKey: string) => {
    if (adding) return;
    setAdding(cardKey);
    try {
      await addCard({ cardKey });
    } catch (e) {
      console.error("addCard failed", e);
    } finally {
      setAdding(null);
    }
  };

  const addButton = (cardKey: string) =>
    ownedKeys.has(cardKey) ? (
      <PillButton label="Added ✓" tone="soft" disabled />
    ) : (
      <PillButton
        label={adding === cardKey ? "Adding…" : "Add"}
        onPress={() => onAdd(cardKey)}
        disabled={adding !== null}
      />
    );

  const searching = trimmed.length >= 2;
  const issuers = (popular ?? []).map((g) => g.issuer);
  const popularCards = (popular ?? [])
    .filter((g) => !issuerFilter || g.issuer === issuerFilter)
    .flatMap((g) => g.cards.map((c) => ({ ...c, issuer: g.issuer })));

  const feeSub = (annualFee: number | null | undefined, issuer: string) =>
    annualFee != null ? (annualFee > 0 ? `${usd(annualFee)} fee` : "No annual fee") : issuer;

  const footer = (
    <Text variant="caption" color="tertiary" style={{ marginTop: spacing.lg, textAlign: "center" }}>
      No bank login required — credits are tracked manually.
    </Text>
  );

  return (
    <Screen keyboardShouldPersistTaps="handled">
      {/* Sheet header */}
      <View
        style={{
          paddingTop: spacing.lg,
          marginBottom: spacing.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text variant="largeTitle" style={{ fontSize: 30, lineHeight: 36 }}>
          Add a card
        </Text>
        <IconButton
          icon="close"
          accessibilityLabel="Close"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/cards"))}
        />
      </View>

      <SearchField placeholder="Search premium cards" value={term} onChangeText={setTerm} autoFocus />

      {searching ? (
        <>
          <SectionLabel
            right={apiSearching ? <Text variant="sectionLabel" color="tertiary">Searching…</Text> : undefined}
          >
            Results
          </SectionLabel>
          {searchResults.length === 0 ? (
            apiSearching || localResults === undefined ? (
              <Skeleton height={140} borderRadius={16} />
            ) : (
              <EmptyState
                icon="search"
                title="No cards found"
                subtitle="Try the issuer's name or a shorter search."
              />
            )
          ) : (
            <Card padded={false}>
              {searchResults.map((r, i) => (
                <ListRow
                  key={r.cardKey}
                  separator={i < searchResults.length - 1}
                  left={<CardArt cardKey={r.cardKey} width={46} />}
                  right={addButton(r.cardKey)}
                >
                  <Text variant="body" numberOfLines={1}>
                    {r.cardName}
                  </Text>
                  <Text variant="subtext" color="secondary" numberOfLines={1} style={{ marginTop: 1 }}>
                    {r.cardIssuer}
                  </Text>
                </ListRow>
              ))}
            </Card>
          )}
          {footer}
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.base }}>
            <Chip label="All" selected={issuerFilter === null} onPress={() => setIssuerFilter(null)} />
            {issuers.map((issuer) => (
              <Chip
                key={issuer}
                label={issuer}
                selected={issuerFilter === issuer}
                onPress={() => setIssuerFilter(issuer)}
              />
            ))}
          </View>

          {popular === undefined ? (
            <View style={{ gap: spacing.md, marginTop: spacing.base }}>
              <Skeleton height={200} borderRadius={16} />
              <Skeleton height={200} borderRadius={16} />
            </View>
          ) : (
            <>
              <SectionLabel
                right={
                  <Text variant="sectionLabel" color="tertiary">
                    {popularCards.length}
                  </Text>
                }
              >
                Popular
              </SectionLabel>
              {popularCards.length === 0 ? (
                <EmptyState icon="search" title="No cards" subtitle="Try a different issuer." />
              ) : (
                <Card padded={false}>
                  {popularCards.map((c, i) => (
                    <ListRow
                      key={c.cardKey}
                      separator={i < popularCards.length - 1}
                      left={<CardArt cardKey={c.cardKey} imageUrl={c.imageUrl} width={46} />}
                      right={addButton(c.cardKey)}
                    >
                      <Text variant="body" numberOfLines={1}>
                        {c.cardName}
                      </Text>
                      <Text variant="subtext" color="secondary" numberOfLines={1} style={{ marginTop: 1 }}>
                        {feeSub(c.annualFee, c.issuer)}
                      </Text>
                    </ListRow>
                  ))}
                </Card>
              )}
              {footer}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
