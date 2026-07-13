import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

import {
  Button,
  Card,
  EmptyState,
  IconButton,
  Screen,
  Skeleton,
  Text,
} from "@/components/ui";
import { goBack } from "@/features/nav/back";
import { spacing, useTheme } from "@/theme";
import { timeAgo } from "@/lib/dates";

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.listNotifications,
    {},
    { initialNumItems: 25 },
  );
  const unread = useQuery(api.notifications.unreadCount) ?? 0;
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  return (
    <Screen
      onScroll={({ nativeEvent }) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        const nearBottom =
          layoutMeasurement.height + contentOffset.y >= contentSize.height - 400;
        if (nearBottom && status === "CanLoadMore") loadMore(25);
      }}
      scrollEventThrottle={200}
    >
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingBottom: spacing.md,
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
        }}
      >
        <IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={() => goBack("/")} />
        <Text variant="title" style={{ flex: 1 }}>
          Notifications
        </Text>
        {unread > 0 ? (
          <Button
            label="Mark all read"
            variant="ghost"
            size="sm"
            haptic={false}
            onPress={() => markAllRead({}).catch(() => {})}
          />
        ) : null}
      </View>

      {status === "LoadingFirstPage" ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={70} borderRadius={16} />
          <Skeleton height={70} borderRadius={16} />
          <Skeleton height={70} borderRadius={16} />
        </View>
      ) : results.length === 0 ? (
        <EmptyState
          icon="bell"
          title="Nothing yet"
          subtitle="Offer alerts and reminders land here — expiring credits, fee renewals, and smart suggestions."
        />
      ) : (
        <Card padded={false}>
          {results.map((n, i) => (
            <Pressable
              key={n._id}
              accessibilityRole="button"
              onPress={() => {
                if (!n.isRead) markRead({ notificationId: n._id }).catch(() => {});
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                gap: spacing.md,
                paddingVertical: spacing.rowPadY,
                paddingHorizontal: spacing.rowPadX,
                borderBottomWidth: i < results.length - 1 ? 1 : 0,
                borderBottomColor: colors.separator,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  marginTop: 6,
                  backgroundColor: n.isRead ? "transparent" : colors.accent,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text variant={n.isRead ? "bodyRegular" : "body"} numberOfLines={2}>
                  {n.title}
                </Text>
                <Text variant="subtext" color="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
                  {n.body}
                </Text>
              </View>
              <Text variant="caption" color="tertiary">
                {timeAgo(n.createdAt)}
              </Text>
            </Pressable>
          ))}
          {status === "LoadingMore" ? (
            <View style={{ padding: spacing.base }}>
              <Skeleton height={40} borderRadius={10} />
            </View>
          ) : null}
        </Card>
      )}
    </Screen>
  );
}
