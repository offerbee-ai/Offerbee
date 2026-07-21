import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/expo";
import { api } from "@packages/backend/convex/_generated/api";

import Providers from "@/lib/providers";
import { CreditsProvider } from "@/features/credits/CreditsProvider";
import { useEntitlement } from "@/features/billing/useEntitlement";
import { usePushNotifications } from "@/features/notifications/usePushNotifications";
import { ThemeProvider, useAppFonts, useTheme } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Registers the Expo push token in dev/EAS builds; silent no-op in Expo Go.
function PushBootstrap() {
  usePushNotifications();
  return null;
}

function RootNavigator() {
  const { colors, isDark } = useTheme();
  const { fontsReady } = useAppFonts();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const me = useQuery(api.users.getMe, isAuthenticated ? {} : "skip");
  const ensureUser = useMutation(api.users.ensureUser);
  const entitlement = useEntitlement();

  // Minute tick so an in-session trial expiry raises the paywall without a
  // reload (query results don't re-evaluate on wall-clock) — mirrors web PaywallGate.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Upsert the Convex user row on sign-in (same contract as the web app).
  useEffect(() => {
    if (!isAuthenticated) return;
    ensureUser({
      email: user?.primaryEmailAddress?.emailAddress ?? undefined,
      name: user?.fullName ?? undefined,
    }).catch((e) => console.error("ensureUser failed", e));
  }, [isAuthenticated, ensureUser, user?.id]);

  // Hold the native splash until fonts + auth state (+ profile & entitlement
  // when signed in) resolve, so the Protected gates never flicker.
  const profilePending = isAuthenticated && me === undefined;
  const entitlementPending = isAuthenticated && entitlement === undefined;
  const ready = fontsReady && !authLoading && !profilePending && !entitlementPending;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  const onboarded = !!me?.onboardingCompletedAt;
  // Lapsed users keep the app mounted but get the paywall sheet pushed over it
  // on every app open (and the moment the trial lapses mid-session). The sheet
  // is closeable — feature writes stay blocked server-side (requireAccess
  // throws SUBSCRIPTION_REQUIRED), so closing only lets them look around.
  // trialExpiredLocally catches an in-session trial crossing its end before
  // the query re-runs.
  const trialExpiredLocally =
    entitlement != null &&
    entitlement.status === "trialing" &&
    entitlement.trialEndsAt !== null &&
    entitlement.trialEndsAt <= now &&
    !entitlement.currentPeriodEnd;
  const lapsed =
    isAuthenticated &&
    onboarded &&
    entitlement !== undefined &&
    entitlement !== null &&
    (!entitlement.hasAccess || trialExpiredLocally);

  // Present the paywall sheet once per lapse episode: on every app open while
  // lapsed (this component remounts per launch) and again the moment access
  // lapses mid-session. Resets when access returns so a future lapse re-nags.
  const nagged = useRef(false);
  useEffect(() => {
    if (!ready || !lapsed) {
      if (!lapsed) nagged.current = false;
      return;
    }
    if (nagged.current) return;
    nagged.current = true;
    router.push("/paywall");
  }, [ready, lapsed]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <PushBootstrap />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={isAuthenticated && !onboarded}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>

        <Stack.Protected guard={isAuthenticated && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="card/[cardKey]" />
          <Stack.Screen name="credit/[creditId]" />
          <Stack.Screen name="add-card" options={{ presentation: "modal" }} />
          <Stack.Screen name="add-card-search" options={{ presentation: "modal" }} />
          <Stack.Screen name="settings" />
          <Stack.Screen name="notifications" />
          {/* Declared after (tabs) so the tabs stay the anchor; pushed
              voluntarily from Settings during the trial and automatically on
              every app open once access lapses (PaywallNag below). */}
          <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Providers>
        <ThemeProvider>
          <CreditsProvider>
            <RootNavigator />
          </CreditsProvider>
        </ThemeProvider>
      </Providers>
    </GestureHandlerRootView>
  );
}
