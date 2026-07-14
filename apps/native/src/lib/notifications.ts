import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Local-notification helpers only. Remote push (Expo push tokens) requires a
// dev/EAS build — Expo Go dropped remote push in SDK 53 — so token registration
// lives behind a runtime guard in the settings feature, not here.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === "granted") return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === "granted";
}

/**
 * Registers one Android notification channel per notification category so
 * users can control each category independently in OS settings. iOS has no
 * channel concept — the `channelId` on a notification payload is ignored
 * there, so this is a no-op off Android. Safe to call repeatedly; Android
 * upserts channels by id and only the name/description may change post-creation.
 */
export async function registerAndroidChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Promise.all([
    Notifications.setNotificationChannelAsync("expiry", {
      name: "Credit expiry",
      importance: Notifications.AndroidImportance.HIGH,
    }),
    Notifications.setNotificationChannelAsync("digest", {
      name: "Weekly digest",
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
    Notifications.setNotificationChannelAsync("renewal", {
      name: "Renewal alerts",
      importance: Notifications.AndroidImportance.HIGH,
    }),
    Notifications.setNotificationChannelAsync("transactions", {
      name: "Detected credits",
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
  ]);
}

/**
 * Registers the notification action categories used by credit reminders so
 * the OS renders action buttons (e.g. Snooze, Log it) on the notification
 * itself. Cross-platform — both iOS and Android support categories, unlike
 * Android notification channels. Safe to call repeatedly; re-registering a
 * category with the same identifier just replaces its actions.
 *
 * Identifiers are contractual: the backend sends `categoryId: "expiring"` /
 * `"suggested"`, and the D4 response handler matches action identifiers
 * exactly, so don't rename these without updating both sides.
 */
export async function registerNotificationCategories(): Promise<void> {
  await Promise.all([
    Notifications.setNotificationCategoryAsync("expiring", [
      { identifier: "snooze", buttonTitle: "Snooze" },
    ]),
    Notifications.setNotificationCategoryAsync("suggested", [
      { identifier: "log_it", buttonTitle: "Log it" },
      { identifier: "not_mine", buttonTitle: "Not mine" },
    ]),
  ]);
}

/** Onboarding step 4: fire a realistic sample so the user sees what reminders look like. */
export async function sendSampleNotification(): Promise<boolean> {
  const granted = await ensurePermission();
  if (!granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Dining credit expires in 2 days",
      body: "Amex Gold · $10 resets at month end. Use it before it's gone.",
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
    },
  });
  return true;
}
