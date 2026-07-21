import { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
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

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  const onboarded = !!me?.onboardingCompletedAt;
  // Onboarded users without access land on the hard paywall. entitlement is
  // resolved by this point (splash held above); null only for the unauthed
  // case, which the isAuthenticated guard already excludes.
  const paywalled =
    isAuthenticated &&
    onboarded &&
    entitlement !== undefined &&
    entitlement !== null &&
    !entitlement.hasAccess;

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

        <Stack.Protected guard={isAuthenticated && onboarded && paywalled}>
          <Stack.Screen name="paywall" />
        </Stack.Protected>

        <Stack.Protected guard={isAuthenticated && onboarded && !paywalled}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="card/[cardKey]" />
          <Stack.Screen name="credit/[creditId]" />
          <Stack.Screen name="add-card" options={{ presentation: "modal" }} />
          <Stack.Screen name="add-card-search" options={{ presentation: "modal" }} />
          <Stack.Screen name="settings" />
          <Stack.Screen name="notifications" />
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
