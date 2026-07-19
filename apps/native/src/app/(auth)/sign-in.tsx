import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSignIn } from "@clerk/clerk-expo";

import { Button, Card, Icon, Screen, Text } from "@/components/ui";
import { spacing } from "@/theme";
import { fontFamilies } from "@/theme/typography";
import { AuthField, OAuthButtons, OrDivider } from "@/features/auth/components";
import { clerkError } from "@/features/auth/errors";

export default function SignIn() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSignIn = async () => {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn.create({ identifier: email.trim(), password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        // Root Stack.Protected gate flips to tabs/onboarding once auth updates.
      } else {
        setError("Additional verification is required for this account.");
      }
    } catch (err) {
      setError(clerkError(err, "Couldn't sign in. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const onForgot = () =>
    router.push({ pathname: "/forgot-password", params: { email: email.trim() } });

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        hitSlop={8}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 1,
          paddingTop: insets.top + spacing.sm,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Icon name="chevronLeft" size={20} color="accent" />
        <Text variant="button" color="accent">
          Back
        </Text>
      </Pressable>

      <Text style={{ fontFamily: fontFamilies.display, fontSize: 28, lineHeight: 34, marginTop: spacing.base }}>
        Welcome back
      </Text>
      <Text variant="bodyRegular" color="secondary" style={{ marginTop: spacing.xs }}>
        Pick up right where you left off.
      </Text>

      <Card size="lg" style={{ marginTop: spacing.lg, gap: spacing.base }}>
        <OAuthButtons />
        <OrDivider />
        <AuthField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholder="you@email.com"
        />
        <AuthField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          placeholder="Your password"
          right={
            <Pressable onPress={onForgot} hitSlop={6}>
              <Text variant="caption" color="accent" style={{ fontFamily: fontFamilies.textSemiBold }}>
                Forgot password?
              </Text>
            </Pressable>
          }
        />
        {error ? (
          <Text variant="subtext" color="alert">
            {error}
          </Text>
        ) : null}
        <Button label="Sign in" loading={busy} disabled={!email.trim() || !password} onPress={onSignIn} />
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 4 }}>
          <Text variant="subtext" color="secondary">
            New to OfferBee?
          </Text>
          <Pressable onPress={() => router.replace("/sign-up")} hitSlop={6}>
            <Text variant="subtext" color="accent" style={{ fontFamily: fontFamilies.textSemiBold }}>
              Create account
            </Text>
          </Pressable>
        </View>
      </Card>
    </Screen>
  );
}
