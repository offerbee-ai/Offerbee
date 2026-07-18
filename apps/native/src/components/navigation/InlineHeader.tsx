import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, Text } from "@/components/ui";
import { fontFamilies } from "@/theme/typography";
import { spacing } from "@/theme";

/**
 * Inline (pushed-screen) nav bar: accent "‹ {back}" on the left, a centered
 * serif title, and an optional trailing action. Flex layout so a long title
 * never collides with the back label — the title takes the middle and truncates.
 */
export function InlineHeader({
  backLabel,
  onBack,
  title,
  trailing,
}: {
  backLabel: string;
  onBack: () => void;
  title: string;
  trailing?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.sm,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        minHeight: 44,
      }}
    >
      {/* Sides grow equally from a zero basis (flexBasis 0) so both columns end
          up the SAME width regardless of their content — that's what keeps the
          title truly centered even though the left side has a back label and the
          right is often empty. flexShrink 0 keeps the back label / trailing action
          fully visible; a long title truncates in the middle instead. */}
      <View style={{ flexGrow: 1, flexShrink: 0, flexBasis: 0, alignItems: "flex-start" }}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          hitSlop={10}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 1,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="chevronLeft" size={22} color="accent" />
          <Text variant="button" color="accent" numberOfLines={1}>
            {backLabel}
          </Text>
        </Pressable>
      </View>

      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          minWidth: 0,
          textAlign: "center",
          paddingHorizontal: spacing.sm,
          fontFamily: fontFamilies.display,
          fontSize: 17,
          lineHeight: 22,
        }}
      >
        {title}
      </Text>

      <View style={{ flexGrow: 1, flexShrink: 0, flexBasis: 0, alignItems: "flex-end" }}>
        {trailing}
      </View>
    </View>
  );
}
