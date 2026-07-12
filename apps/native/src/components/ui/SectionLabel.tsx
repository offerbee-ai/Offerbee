import { View } from "react-native";

import { spacing } from "@/theme/tokens";
import { Text } from "./Text";

/** Uppercase mono section header (e.g. "AT A GLANCE"), optional right accessory. */
export function SectionLabel({
  children,
  right,
}: {
  children: string;
  right?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: spacing.xl,
        marginBottom: spacing.sm,
        paddingHorizontal: spacing.xs,
      }}
    >
      <Text variant="sectionLabel" color="tertiary">
        {children}
      </Text>
      {right}
    </View>
  );
}
