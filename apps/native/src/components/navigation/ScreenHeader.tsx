import { View } from "react-native";

import { Text } from "@/components/ui";
import { spacing } from "@/theme";

/** Large-title screen header: optional mono kicker (e.g. "JULY 2026") + serif title. */
export function ScreenHeader({
  title,
  kicker,
  trailing,
}: {
  title: string;
  kicker?: string;
  trailing?: React.ReactNode;
}) {
  // NativeTabs lays screen content inside the top safe area already, so we only
  // add breathing room here (no manual insets.top, which double-counted).
  return (
    <View
      style={{
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
      }}
    >
      <View style={{ gap: 4 }}>
        {kicker ? (
          <Text variant="sectionLabel" color="tertiary">
            {kicker}
          </Text>
        ) : null}
        <Text variant="largeTitle">{title}</Text>
      </View>
      {trailing ? (
        <View style={{ flexDirection: "row", gap: spacing.sm, paddingBottom: 4 }}>{trailing}</View>
      ) : null}
    </View>
  );
}
