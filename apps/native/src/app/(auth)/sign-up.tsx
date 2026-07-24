import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSignUp } from "@clerk/expo/legacy";

import { Button, Card, Icon, Screen, Text } from "@/components/ui";
import { spacing } from "@/theme";
import { fontFamilies } from "@/theme/typography";
import { AuthField, OAuthButtons, OrDivider } from "@/features/auth/components";
import { clerkError } from "@/features/auth/errors";
import { LegalConsentRow, needsLegalConsent } from "@/features/auth/legal";

export default function SignUp() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onContinue = async () => {
    if (!isLoaded || busy || !legalAccepted) return;
    setBusy(true);
    setError(null);
    try {
      // Clerk requires express legal consent (Configure → Legal); without
      // legalAccepted it parks the sign-up at missing_requirements instead of
      // throwing, and prepareEmailAddressVerification then fails.
      const created = await signUp.create({
        emailAddress: email.trim(),
        password,
        legalAccepted,
      });
      if (needsLegalConsent(created)) {
        setError("Please accept the Terms of Service and Privacy Policy to continue.");
        return;
      }
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        // Root Stack.Protected gate flips to onboarding once auth updates.
      } else {
        setError("That code didn't verify. Check the email and try again.");
      }
    } catch (err) {
      setError(clerkError(err));
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
        Create your account
      </Text>
      <Text variant="bodyRegular" color="secondary" style={{ marginTop: spacing.xs }}>
        Your first "aha" is about two minutes away.
      </Text>

      <Card size="lg" style={{ marginTop: spacing.lg, gap: spacing.base }}>
        {pendingVerification ? (
          <>
            <Text variant="body">Enter the code we emailed to {email}.</Text>
            <AuthField
              label="Verification code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoFocus
              placeholder="123456"
            />
            {error ? (
              <Text variant="subtext" color="alert">
                {error}
              </Text>
            ) : null}
            <Button label="Verify & continue" loading={busy} onPress={onVerify} />
          </>
        ) : (
          <>
            <OAuthButtons legalAccepted={legalAccepted} />
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
              autoComplete="password-new"
              placeholder="At least 8 characters"
            />
            <LegalConsentRow value={legalAccepted} onValueChange={setLegalAccepted} disabled={busy} />
            {error ? (
              <Text variant="subtext" color="alert">
                {error}
              </Text>
            ) : null}
            <Button
              label="Continue"
              loading={busy}
              disabled={!email.trim() || !password || !legalAccepted}
              onPress={onContinue}
            />
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 4 }}>
              <Text variant="subtext" color="secondary">
                Already have an account?
              </Text>
              <Pressable onPress={() => router.replace("/sign-in")} hitSlop={6}>
                <Text variant="subtext" color="accent" style={{ fontFamily: fontFamilies.textSemiBold }}>
                  Sign in
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </Card>
    </Screen>
  );
}
