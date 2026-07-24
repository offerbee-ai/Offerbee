import { View } from "react-native";
import { router } from "expo-router";

import {
  Badge,
  Card,
  CardArt,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
  Screen,
  SectionLabel,
  Skeleton,
  Text,
} from "@/components/ui";
import { spacing } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";
import { netStr, usd } from "@/features/credits/derive";

export default function CardsScreen() {
  const { derived, isLoading } = useCredits();

  return (
    <Screen
      withTabBarClearance
      header={{
        title: "Cards",
        trailing: (
          <IconButton
            icon="plus"
            accessibilityLabel="Add a card"
            onPress={() => router.push("/add-card")}
          />
        ),
      }}
    >
      {isLoading ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={110} borderRadius={18} />
          <Skeleton height={240} borderRadius={16} />
        </View>
      ) : (
        <>
          {/* Portfolio net */}
          <Card size="lg">
            <Text variant="sectionLabel" color="tertiary">
              Net across {derived.cards.length}{" "}
              {derived.cards.length === 1 ? "card" : "cards"}
            </Text>
            <Text
              variant="figureL"
              color={derived.net >= 0 ? "accent" : "warning"}
              style={{ marginTop: spacing.sm }}
            >
              {netStr(derived.net)}
            </Text>
            <Text variant="subtext" color="secondary" style={{ marginTop: 4 }}>
              {usd(derived.captured)} captured · {usd(derived.fees)} in annual fees
            </Text>
          </Card>

          <SectionLabel>Your wallet</SectionLabel>
          {derived.cards.length === 0 ? (
            <EmptyState
              icon="card"
              title="No cards yet"
              subtitle="Add a card to see whether its annual fee earns its keep."
              actionLabel="Add a card"
              onAction={() => router.push("/add-card")}
            />
          ) : (
            <Card padded={false}>
              {derived.cards.map((card, i) => (
                <ListRow
                  key={card.id}
                  onPress={() => router.push({ pathname: "/card/[cardKey]", params: { cardKey: card.id } })}
                  separator={i < derived.cards.length - 1}
                  left={<CardArt cardKey={card.id} imageUrl={card.image} color={card.color} width={46} />}
                  right={
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <View style={{ alignItems: "flex-end", gap: 3 }}>
                        <Text variant="figureS" color={card.keep ? "accent" : "warning"}>
                          {netStr(card.net)}
                        </Text>
                        <Badge label={card.verdict} tone={card.keep ? "accent" : "warning"} />
                      </View>
                      <Icon name="chevronRight" size={18} color="tertiary" />
                    </View>
                  }
                >
                  <Text variant="body" numberOfLines={1}>
                    {card.name}
                  </Text>
                  <Text variant="subtext" color="secondary" numberOfLines={1} style={{ marginTop: 1 }}>
                    {card.fee > 0 ? `${usd(card.fee)} fee` : "No annual fee"} ·{" "}
                    {usd(card.captured)} captured
                  </Text>
                </ListRow>
              ))}
            </Card>
          )}

          <Text
            variant="caption"
            color="tertiary"
            style={{ marginTop: spacing.base, textAlign: "center" }}
          >
            Tap a card to review its credits and renewal.
          </Text>
        </>
      )}
    </Screen>
  );
}
