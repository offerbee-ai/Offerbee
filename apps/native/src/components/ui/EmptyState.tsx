import { View } from "react-native";

import { spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";
import { Icon, type IconName } from "./Icon";
import { Button } from "./Button";

type EmptyStateProps = {
  icon: IconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: spacing.xl * 2, gap: spacing.md }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.field,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={24} color="tertiary" />
      </View>
      <Text variant="body" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="subtext" color="secondary" style={{ textAlign: "center", maxWidth: 260 }}>
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.sm }}>
          <Button label={actionLabel} size="sm" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
