import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

import {
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  SectionLabel,
  Skeleton,
  Text,
} from "@/components/ui";
import { NotificationRow } from "@/features/notifications/components/NotificationRow";
import { notifCategory, notifTarget, type NotifData } from "@/features/notifications/derive";
import { useCredits } from "@/features/credits/CreditsProvider";
import { goBack } from "@/features/nav/back";
import { spacing } from "@/theme";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { markUsed } = useCredits();

  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.listNotifications,
    {},
    { initialNumItems: 25 },
  );
  const unread = useQuery(api.notifications.unreadCount) ?? 0;
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  const newItems = results.filter((n) => !n.isRead);
  const earlierItems = results.filter((n) => n.isRead);

  type Row = (typeof results)[number];

  const openTarget = (n: Row) => {
    if (!n.isRead) markRead({ notificationId: n._id }).catch(() => {});
    const href = notifTarget(n.data as NotifData);
    if (href) router.push(href as never);
  };

  const doAction = (n: Row) => {
    if (notifCategory(n.type) === "expiring") {
      const creditId = (n.data as { creditId?: string } | null | undefined)?.creditId;
      if (creditId) markUsed(creditId);
    }
    openTarget(n);
  };

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
        <IconButton icon="chevronLeft" accessibilityLabel="Review" onPress={() => goBack("/")} />
        <Text variant="title" style={{ flex: 1 }}>
          Notifications
        </Text>
        <Button
          label="Mark read"
          variant="ghost"
          size="sm"
          haptic={false}
          disabled={unread === 0}
          onPress={() => markAllRead({}).catch(() => {})}
        />
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
          title="You're all caught up"
          subtitle="We'll nudge you before any credit resets."
        />
      ) : (
        <>
          {newItems.length > 0 ? (
            <>
              <SectionLabel>{`New · ${unread}`}</SectionLabel>
              <Card padded={false}>
                {newItems.map((n, i) => (
                  <NotificationRow
                    key={n._id}
                    item={n}
                    separator={i < newItems.length - 1}
                    onPress={() => openTarget(n)}
                    onAction={() => doAction(n)}
                  />
                ))}
              </Card>
            </>
          ) : null}

          {earlierItems.length > 0 ? (
            <View style={{ marginTop: newItems.length > 0 ? spacing.lg : 0 }}>
              <SectionLabel>Earlier</SectionLabel>
              <Card padded={false}>
                {earlierItems.map((n, i) => (
                  <NotificationRow
                    key={n._id}
                    item={n}
                    separator={i < earlierItems.length - 1}
                    onPress={() => openTarget(n)}
                    onAction={() => doAction(n)}
                  />
                ))}
              </Card>
            </View>
          ) : null}

          {status === "LoadingMore" ? (
            <View style={{ padding: spacing.base }}>
              <Skeleton height={40} borderRadius={10} />
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/settings")}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              paddingVertical: spacing.base,
              marginTop: spacing.sm,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon name="settings" size={16} color="secondary" />
            <Text variant="bodyRegular" color="secondary">
              Reminder settings
            </Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}
