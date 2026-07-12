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
