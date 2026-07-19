import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSignIn } from "@clerk/clerk-expo";

import { Button, Card, Icon, Screen, Text } from "@/components/ui";
import { spacing } from "@/theme";
import { fontFamilies } from "@/theme/typography";
import { AuthField } from "@/features/auth/components";
import { clerkError } from "@/features/auth/errors";

export default function ForgotPassword() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSendCode = async () => {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email.trim() });
      // A resend starts a fresh attempt — any previously typed code is stale.
      setCode("");
      setCodeSent(true);
    } catch (err) {
      setError(clerkError(err, "Couldn't send the reset code. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
        password,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        // Root Stack.Protected gate flips to tabs/onboarding once auth updates.
      } else if (result.status === "needs_second_factor") {
        setError(
          "Two-factor authentication is required for this account — reset your password on the web instead.",
        );
      } else {
        setError("Couldn't finish the reset. Try again.");
      }
    } catch (err) {
      setError(clerkError(err, "Couldn't reset your password. Try again."));
    } finally {
      setBusy(false);
    }
  };

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
        Reset your password
      </Text>
      <Text variant="bodyRegular" color="secondary" style={{ marginTop: spacing.xs }}>
        We'll email you a code to set a new one.
      </Text>

      <Card size="lg" style={{ marginTop: spacing.lg, gap: spacing.base }}>
        {codeSent ? (
          <>
            <Text variant="body">Enter the code we emailed to {email.trim()}.</Text>
            <AuthField
              label="Reset code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoFocus
              placeholder="123456"
            />
            <AuthField
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password-new"
              placeholder="At least 8 characters"
            />
            {error ? (
              <Text variant="subtext" color="alert">
                {error}
              </Text>
            ) : null}
            <Button
              label="Reset password & sign in"
              loading={busy}
              disabled={!code.trim() || !password}
              onPress={onReset}
            />
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 4 }}>
              <Text variant="subtext" color="secondary">
                Didn't get it?
              </Text>
              <Pressable onPress={onSendCode} hitSlop={6}>
                <Text variant="subtext" color="accent" style={{ fontFamily: fontFamilies.textSemiBold }}>
                  Resend code
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <AuthField
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@email.com"
            />
            {error ? (
              <Text variant="subtext" color="alert">
                {error}
              </Text>
            ) : null}
            <Button label="Send reset code" loading={busy} disabled={!email.trim()} onPress={onSendCode} />
          </>
        )}
      </Card>
    </Screen>
  );
}
