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

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (e) {
    console.error("getExpoPushTokenAsync failed", e);
    return null;
  }
}

// A notification action can fire the instant the app launches from a tap —
// before Clerk/Convex auth has hydrated, so the mutation would reach the server
// with no subject ("Authenticated user was required"). Retry briefly until the
// auth token attaches (~a few hundred ms after launch).
async function withAuthRetry(fn: () => Promise<unknown>): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fn();
      return;
    } catch (e) {
      if (attempt < 5 && String(e).includes("Authenticated user was required")) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw e;
    }
  }
}

export function usePushNotifications() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const registerToken = useMutation(api.push.registerPushToken);
  const snoozeBenefit = useMutation(api.benefits.snoozeBenefit);
  const confirmSuggestion = useMutation(api.plaid.confirmSuggestion);
  const dismissSuggestion = useMutation(api.plaid.dismissSuggestion);
  const done = useRef(false);

  // Convex's useMutation returns a fresh function identity every render, and
  // useRouter can too. Depending on them would re-run the effect on each render,
  // tearing down the async token fetch before it resolves (so registerToken
  // never fires). Pin the latest values in a ref and depend only on auth so the
  // effect runs once — the handlers always read current fns via the ref.
  const fns = useRef({ registerToken, snoozeBenefit, confirmSuggestion, dismissSuggestion, router });
  fns.current = { registerToken, snoozeBenefit, confirmSuggestion, dismissSuggestion, router };

  useEffect(() => {
    if (!isAuthenticated) return;

    registerAndroidChannels().catch((e) => console.error("registerAndroidChannels failed", e));
    registerNotificationCategories().catch((e) =>
      console.error("registerNotificationCategories failed", e),
    );

    // No `active` cancel: registerPushToken is an idempotent upsert, and `done`
    // guards against a duplicate register, so letting a resolved token register
    // even after a re-render is harmless — and avoids dropping it in a race.
    void (async () => {
      const token = await getPushToken();
      if (!token || done.current) return;
      done.current = true;
      await fns.current
        .registerToken({ token, platform: Platform.OS === "ios" ? "ios" : "android" })
        .catch((e) => console.error("registerPushToken failed", e));
    })();

    if (isExpoGo) return;

    // The listener fires with the NATIVE device token (raw APNs hex on iOS),
    // which Expo's push service can't deliver to — re-derive the Expo push
    // token instead of registering `t.data` directly.
    const tokenSub = Notifications.addPushTokenListener(() => {
      void (async () => {
        const token = await getPushToken();
        if (!token) return;
        await fns.current
          .registerToken({ token, platform: Platform.OS === "ios" ? "ios" : "android" })
          .catch(() => {});
      })();
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
      const f = fns.current;

      if (actionIdentifier === "snooze" && data.benefitId) {
        const userBenefitId = data.benefitId as Id<"userBenefits">;
        try {
          await withAuthRetry(() => f.snoozeBenefit({ userBenefitId }));
        } catch (e) {
          console.error("snoozeBenefit failed", e);
        }
      } else if (actionIdentifier === "log_it" && data.transactionId) {
        const transactionId = data.transactionId;
        try {
          await withAuthRetry(() => f.confirmSuggestion({ transactionId }));
        } catch (e) {
          console.error("confirmSuggestion failed", e);
        }
      } else if (actionIdentifier === "not_mine" && data.transactionId) {
        const transactionId = data.transactionId;
        try {
          await withAuthRetry(() => f.dismissSuggestion({ transactionId }));
        } catch (e) {
          console.error("dismissSuggestion failed", e);
        }
      }

      f.router.push(routeFromData(data));
    }

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response);
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) void handleResponse(response);
    });

    return () => {
      tokenSub.remove();
      responseSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);
}
