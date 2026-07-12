import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

// Remote push token registration. No-ops in Expo Go (remote push unsupported
// since SDK 53) and on simulators — it activates automatically in dev/EAS builds
// once `eas init` provides a projectId.

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

async function getPushToken(): Promise<string | null> {
  if (isExpoGo || !Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  const status =
    existing.status === "granted"
      ? existing.status
      : (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
      ?.projectId;
  if (!projectId) return null; // run `eas init` to enable push tokens

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export function usePushNotifications() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const registerToken = useMutation(api.push.registerPushToken);
  const done = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;

    (async () => {
      const token = await getPushToken();
      if (!token || !active || done.current) return;
      done.current = true;
      await registerToken({ token, platform: Platform.OS === "ios" ? "ios" : "android" }).catch(
        (e) => console.error("registerPushToken failed", e),
      );
    })();

    if (isExpoGo) return;

    const tokenSub = Notifications.addPushTokenListener((t) => {
      registerToken({ token: t.data, platform: Platform.OS === "ios" ? "ios" : "android" }).catch(
        () => {},
      );
    });

    // Tapping a notification deep-links into the inbox.
    const responseSub = Notifications.addNotificationResponseReceivedListener(() =>
      router.push("/notifications"),
    );
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) router.push("/notifications");
    });

    return () => {
      active = false;
      tokenSub.remove();
      responseSub.remove();
    };
  }, [isAuthenticated, registerToken, router]);
}
