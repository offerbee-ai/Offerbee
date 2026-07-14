import { View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

import { Card, PillButton, SectionLabel, Text } from "@/components/ui";
import { spacing, useTheme } from "@/theme";
import { usd } from "@/features/credits/derive";

// "Detected": Plaid transactions matched to a credit at medium confidence,
// awaiting confirm/dismiss. (High-confidence matches auto-log silently.)
export function DetectedSection() {
  const { colors } = useTheme();
  const suggestions = useQuery(api.plaid.listSuggestions);
  const confirm = useMutation(api.plaid.confirmSuggestion);
  const dismiss = useMutation(api.plaid.dismissSuggestion);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <>
      <SectionLabel
        right={
          <Text variant="sectionLabel" color="tertiary">
            {suggestions.length}
          </Text>
        }
      >
        Detected
      </SectionLabel>
      <Card padded={false}>
        {suggestions.map((s, i) => (
          <View
            key={s.transactionId}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              padding: spacing.base,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.separator,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="body" numberOfLines={1}>
                {usd(s.amount)} at {s.merchantName}
              </Text>
              <Text variant="subtext" color="secondary" numberOfLines={1} style={{ marginTop: 1 }}>
                {s.benefitTitle ?? "Matched credit"}
              </Text>
            </View>
            <PillButton
              label="Confirm"
              tone="accent"
              onPress={() => void confirm({ transactionId: s.transactionId })}
            />
            <PillButton
              label="Dismiss"
              tone="neutral"
              onPress={() => void dismiss({ transactionId: s.transactionId })}
            />
          </View>
        ))}
      </Card>
    </>
  );
}
