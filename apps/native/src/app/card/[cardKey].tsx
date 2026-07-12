import { Alert, Pressable, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

import {
  Badge,
  Card,
  CardArt,
  Icon,
  IconButton,
  ProgressBar,
  Screen,
  SectionLabel,
  Skeleton,
  Text,
} from "@/components/ui";
import { InlineHeader } from "@/components/navigation/InlineHeader";
import { spacing, useTheme } from "@/theme";
import { useCredits } from "@/features/credits/CreditsProvider";
import { netStr, usd, type DerivedCredit } from "@/features/credits/derive";

/** Card-detail credit row: navigational, with a used/total fraction + chevron. */
function CardCreditRow({
  credit,
  cardName,
  separator,
}: {
  credit: DerivedCredit;
  cardName: string;
  separator: boolean;
}) {
  const { colors } = useTheme();
  const urgent = !credit.used && credit.days <= 7;
  const sub = credit.used
    ? `${credit.cycleLabel} · used this cycle`
    : urgent
      ? `${credit.amountStr} expires in ${credit.days} ${credit.days === 1 ? "day" : "days"}`
      : `${credit.cycleLabel} · available`;
  const fracColor =
    credit.usedAmount <= 0 ? "tertiary" : credit.usedAmount >= credit.amount ? "accent" : "ink";

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push(`/credit/${credit.id}?from=${encodeURIComponent(cardName)}`)
        }
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.base,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1}>
            {credit.name}
          </Text>
          <Text
            variant="subtext"
            color={urgent ? "warning" : "secondary"}
            numberOfLines={1}
            style={{ marginTop: 1 }}
          >
            {sub}
          </Text>
        </View>
        <Text variant="mono" color={fracColor}>
          {usd(credit.usedAmount)}/{usd(credit.amount)}
        </Text>
        <Icon name="chevronRight" size={16} color="tertiary" />
      </Pressable>
      {separator ? (
        <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: spacing.base }} />
      ) : null}
    </View>
  );
}

export default function CardDetailScreen() {
  const { cardKey } = useLocalSearchParams<{ cardKey: string }>();
  const win = useWindowDimensions();

  const { derived, walletCards } = useCredits();
  const detail = useQuery(api.catalog.getCardDetail, cardKey ? { cardKey } : "skip");
  const removeCard = useMutation(api.wallet.removeCard);

  const walletCard = walletCards.find((c) => c.cardKey === cardKey);
  const derivedCard = derived.cards.find((c) => c.id === cardKey);
  const cardCredits = derived.decorated.filter((c) => c.cardId === cardKey);

  const name = walletCard?.name ?? detail?.cardName ?? "Card";
  const fee = detail?.annualFee ?? walletCard?.fee ?? 0;
  const issuer = detail?.cardIssuer ?? walletCard?.issuer ?? "";
  const heroWidth = win.width - spacing.screenInset * 2;

  const onRemove = () => {
    if (!walletCard) return;
    Alert.alert(
      "Remove card?",
      "Tracked credits are archived, not deleted — re-adding the card restores them with full history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeCard({ userCardId: walletCard.userCardId });
              router.back();
            } catch (e) {
              console.error("removeCard failed", e);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <InlineHeader
        backLabel="Cards"
        onBack={() => router.back()}
        title={name}
        trailing={
          walletCard ? (
            <IconButton icon="ellipsis" accessibilityLabel="Card options" onPress={onRemove} />
          ) : undefined
        }
      />

      {/* Card art hero */}
      <View style={{ alignItems: "center", marginTop: spacing.xs }}>
        <CardArt
          cardKey={cardKey}
          imageUrl={detail?.cardImageUrl ?? walletCard?.imageUrl}
          width={heroWidth}
          borderRadius={16}
        />
        <Text variant="subtext" color="secondary" style={{ marginTop: spacing.md }}>
          {issuer}
          {fee > 0 ? ` · ${usd(fee)} annual fee` : " · No annual fee"}
        </Text>
      </View>

      {/* Fee ROI */}
      {derivedCard ? (
        <Card size="lg" style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="sectionLabel" color="tertiary">
              Captured this year
            </Text>
            <Badge label={derivedCard.verdict} tone={derivedCard.keep ? "accent" : "warning"} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.sm }}>
            <Text variant="figureM">{usd(derivedCard.captured)}</Text>
            {fee > 0 ? (
              <Text variant="subtext" color="tertiary" style={{ marginBottom: 5 }}>
                of {usd(fee)}
              </Text>
            ) : null}
          </View>
          <View style={{ marginTop: spacing.md }}>
            <ProgressBar
              progress={derivedCard.pct / 100}
              height={8}
              tone={derivedCard.keep ? "accent" : "warning"}
            />
          </View>
          <Text variant="subtext" color={derivedCard.keep ? "accent" : "warning"} style={{ marginTop: spacing.sm }}>
            {derivedCard.keep
              ? `${netStr(derivedCard.net)} over the fee · break-even cleared`
              : `${usd(Math.abs(derivedCard.net))} under the fee · worth a review`}
          </Text>
        </Card>
      ) : (
        <Skeleton height={140} borderRadius={18} style={{ marginTop: spacing.lg }} />
      )}

      {/* Tracked credits */}
      <SectionLabel
        right={
          <Text variant="sectionLabel" color="tertiary">
            {cardCredits.length}
          </Text>
        }
      >
        Credits
      </SectionLabel>
      {cardCredits.length === 0 ? (
        <Card>
          <Text variant="bodyRegular" color="secondary">
            No credits tracked for this card yet.
          </Text>
        </Card>
      ) : (
        <Card padded={false}>
          {cardCredits.map((c, i) => (
            <CardCreditRow
              key={c.id}
              credit={c}
              cardName={name}
              separator={i < cardCredits.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
