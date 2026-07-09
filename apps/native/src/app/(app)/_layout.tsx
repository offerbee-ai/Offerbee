import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";
import { PushRegistrar } from "../../components/PushRegistrar";

export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return null;

  if (!isSignedIn) return <Redirect href="/sign-in" />;

  return (
    <>
      {/* Registers the user + push token with the shared backend. */}
      <PushRegistrar />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
