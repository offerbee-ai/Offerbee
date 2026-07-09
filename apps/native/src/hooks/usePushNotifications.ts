import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { type Href, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { registerForPushNotificationsAsync } from "../lib/notifications";

// Cast because typed-routes regenerates the route union at build time; the file
// exists at app/(app)/notifications.tsx.
const OFFERS_ROUTE = "/notifications" as unknown as Href;

function currentPlatform(): "ios" | "android" | "web" {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

// Registers the device's Expo push token with the shared backend and wires the
// foreground / tap listeners. Mounts only inside the authenticated group.
export function usePushNotifications() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const registerToken = useMutation(api.push.registerPushToken);
  const done = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;

    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (!token || !active || done.current) return;
      done.current = true;
      await registerToken({ token, platform: currentPlatform() }).catch((e) =>
        console.error("registerPushToken failed", e),
      );
    })();

    // Re-register if the token rotates.
    const tokenSub = Notifications.addPushTokenListener((t) => {
      registerToken({ token: t.data, platform: currentPlatform() }).catch(() => {
        /* best effort */
      });
    });

    // Tapping a notification deep-links into the offers list.
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      () => router.push(OFFERS_ROUTE),
    );

    // Cold start from a tapped notification.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) router.push(OFFERS_ROUTE);
    });

    return () => {
      active = false;
      tokenSub.remove();
      responseSub.remove();
    };
  }, [isAuthenticated, registerToken, router]);
}
