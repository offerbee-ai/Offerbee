import { Pressable, View } from "react-native";

import { Icon, PillButton, Text } from "@/components/ui";
import { spacing, useTheme } from "@/theme";
import { timeAgo } from "@/lib/dates";
import { CATEGORY_STYLE, notifAction, notifCategory, type NotifData } from "../derive";

export type NotificationItem = {
  _id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: number;
  data?: NotifData;
};

/** One notification: category glyph tile, title/body/timestamp, unread dot + action. */
export function NotificationRow({
  item,
  separator,
  onPress,
  onAction,
}: {
  item: NotificationItem;
  separator: boolean;
  onPress: () => void;
  onAction: () => void;
}) {
  const { colors } = useTheme();
  const category = notifCategory(item.type);
  const style = CATEGORY_STYLE[category];
  const action = notifAction(category);
  const unread = !item.isRead;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: spacing.md,
        paddingVertical: spacing.rowPadY,
        paddingHorizontal: spacing.rowPadX,
        borderBottomWidth: separator ? 1 : 0,
        borderBottomColor: colors.separator,
        backgroundColor: unread ? colors.accentSoft + "40" : "transparent",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors[style.softKey],
        }}
      >
        <Icon name={style.icon} size={18} color={style.inkKey} />
      </View>

      <View style={{ flex: 1 }}>
        <Text variant={unread ? "body" : "bodyRegular"} numberOfLines={2}>
          {item.title}
        </Text>
        <Text variant="subtext" color="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
          {item.body}
        </Text>
        <Text variant="caption" color="tertiary" style={{ marginTop: 4 }}>
          {timeAgo(item.createdAt)}
        </Text>
      </View>

      <View style={{ alignItems: "flex-end", gap: spacing.sm, justifyContent: "center" }}>
        {unread ? (
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }} />
        ) : null}
        <PillButton label={action.label} tone={action.tone} onPress={onAction} />
      </View>
    </Pressable>
  );
}
