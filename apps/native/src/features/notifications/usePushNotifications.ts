import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter, type Href } from "expo-router";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { registerAndroidChannels, registerNotificationCategories } from "@/lib/notifications";

type NotificationData = {
  route?: string;
  cardKey?: string;
  benefitId?: string;
  transactionId?: string;
};

// Maps a notification's `data` payload to the screen it should deep-link to.
// Falls back to the inbox when the route is missing/unrecognized or a
// required param (e.g. cardKey) wasn't included in the payload.
function routeFromData(data: NotificationData): Href {
  switch (data.route) {
    case "card":
      if (data.cardKey) {
        return { pathname: "/card/[cardKey]", params: { cardKey: data.cardKey } };
      }
      return "/notifications";
    case "detected":
    case "benefits":
      return "/benefits";
    default:
      return "/notifications";
  }
}

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
  const snoozeBenefit = useMutation(api.benefits.snoozeBenefit);
  const confirmSuggestion = useMutation(api.plaid.confirmSuggestion);
  const dismissSuggestion = useMutation(api.plaid.dismissSuggestion);
  const done = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;

    registerAndroidChannels().catch((e) => console.error("registerAndroidChannels failed", e));
    registerNotificationCategories().catch((e) =>
      console.error("registerNotificationCategories failed", e),
    );

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

    // Shared handler for both the live listener and a cold-start launch
    // response (app opened directly from a notification/action tap).
    // Action buttons run their mutation first (v1: actions only fire while
    // the app is foregrounded, since tapping one opens the app), then we
    // always deep-link by route — a failed mutation still navigates rather
    // than stranding the user on a dead notification.
    async function handleResponse(response: Notifications.NotificationResponse) {
      const actionIdentifier = response.actionIdentifier;
      const data = (response.notification.request.content.data ?? {}) as NotificationData;

      if (actionIdentifier === "snooze" && data.benefitId) {
        try {
          await snoozeBenefit({ userBenefitId: data.benefitId as Id<"userBenefits"> });
        } catch (e) {
          console.error("snoozeBenefit failed", e);
        }
      } else if (actionIdentifier === "log_it" && data.transactionId) {
        try {
          await confirmSuggestion({ transactionId: data.transactionId });
        } catch (e) {
          console.error("confirmSuggestion failed", e);
        }
      } else if (actionIdentifier === "not_mine" && data.transactionId) {
        try {
          await dismissSuggestion({ transactionId: data.transactionId });
        } catch (e) {
          console.error("dismissSuggestion failed", e);
        }
      }

      router.push(routeFromData(data));
    }

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response);
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) void handleResponse(response);
    });

    return () => {
      active = false;
      tokenSub.remove();
      responseSub.remove();
    };
  }, [isAuthenticated, registerToken, router, snoozeBenefit, confirmSuggestion, dismissSuggestion]);
}
