import { useCallback, useState } from "react";
import { Image, Platform, Pressable, TextInput, View, type TextInputProps } from "react-native";
import { AntDesign } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useSSO } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";

import { Text } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { fontFamilies } from "@/theme/typography";
import { clerkError } from "@/features/auth/errors";
import { LegalConsentPrompt, needsLegalConsent } from "@/features/auth/legal";

// Warm up the browser for a snappier OAuth handoff (Expo/Clerk recommendation).
WebBrowser.maybeCompleteAuthSession();

/** Labeled text input matching the auth form spec (border, r9, padding 12/13). */
export function AuthField({
  label,
  right,
  style,
  ...inputProps
}: TextInputProps & { label: string; right?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="subtext" style={{ fontSize: 13, fontFamily: fontFamilies.textSemiBold }}>
          {label}
        </Text>
        {right}
      </View>
      <TextInput
        placeholderTextColor={colors.tertiary}
        style={[
          {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 9,
            paddingVertical: 13,
            paddingHorizontal: 12,
            backgroundColor: colors.background,
            color: colors.ink,
            fontFamily: fontFamilies.text,
            fontSize: 15,
          },
          style,
        ]}
        {...inputProps}
      />
    </View>
  );
}

/** "or" divider with hairlines. */
export function OrDivider() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.base }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.separator }} />
      <Text variant="caption" color="tertiary">
        or
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.separator }} />
    </View>
  );
}

type Provider = "google" | "apple";

/**
 * An OAuth identity Clerk transferred into a sign-up that still needs express
 * legal consent. Structurally typed so we don't depend on `@clerk/types`
 * directly (it isn't a declared dependency of this app).
 */
type PendingConsent = {
  signUp: {
    update: (params: { legalAccepted: boolean }) => Promise<{
      status: string | null;
      createdSessionId: string | null;
    }>;
  };
  setActive: (params: { session: string }) => Promise<unknown>;
};

function OAuthButton({
  label,
  icon,
  pending,
  disabled,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  pending: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.md,
        height: 50,
        borderRadius: radius.button,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: disabled && !pending ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <Text variant="body">{pending ? "Connecting…" : label}</Text>
    </Pressable>
  );
}

/**
 * Google (browser SSO) + Apple (native sheet, iOS only) buttons wired to
 * Clerk. On success setActive flips the root Stack.Protected gate to
 * onboarding/tabs — no manual navigation.
 * (Design shows Google only; Apple is kept per product decision.)
 *
 * A first-time OAuth user is transferred to a sign-up, which Clerk holds at
 * `missing_requirements` until express legal consent arrives. Pass
 * `legalAccepted` when the host screen already collected it (sign-up);
 * otherwise this component asks inline (sign-in).
 */
export function OAuthButtons({ legalAccepted = false }: { legalAccepted?: boolean }) {
  const { colors } = useTheme();
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentFor, setConsentFor] = useState<PendingConsent | null>(null);
  const [consent, setConsent] = useState(false);
  const [finishing, setFinishing] = useState(false);

  /** Attach consent to the transferred sign-up, then activate its session. */
  const finish = useCallback(async ({ signUp, setActive }: PendingConsent) => {
    const updated = await signUp.update({ legalAccepted: true });
    if (updated.status !== "complete" || !updated.createdSessionId) return false;
    await setActive({ session: updated.createdSessionId });
    return true;
  }, []);

  const run = useCallback(
    async (provider: Provider) => {
      if (pending) return;
      setPending(provider);
      setError(null);
      try {
        const result =
          provider === "apple"
            ? await startAppleAuthenticationFlow()
            : await startSSOFlow({ strategy: "oauth_google" });
        const { createdSessionId, setActive } = result;
        const signUp = "signUp" in result ? result.signUp : undefined;
        // Present on the browser SSO result only; the Apple sheet has none.
        const { authSessionResult } = result as { authSessionResult?: { type?: string } };

        if (createdSessionId && setActive) {
          await setActive({ session: createdSessionId });
          return;
        }
        // User dismissed the browser (Apple's native sheet throws instead).
        if (authSessionResult && authSessionResult.type !== "success") return;

        if (needsLegalConsent(signUp) && setActive) {
          const next: PendingConsent = {
            signUp: signUp as unknown as PendingConsent["signUp"],
            setActive: setActive as unknown as PendingConsent["setActive"],
          };
          // Already consented on this screen — finish without asking twice.
          if (legalAccepted && (await finish(next))) return;
          setConsentFor(next);
          return;
        }
        // No session and no consent gap: say so rather than dead-ending.
        setError("Couldn't finish signing in. Try again.");
      } catch (err) {
        // User dismissed the native Apple sheet — not an error.
        if ((err as { code?: string })?.code === "ERR_REQUEST_CANCELED") return;
        if (!String(err).includes("already signed in")) {
          setError(clerkError(err, "Couldn't sign in. Try again."));
        }
      } finally {
        setPending(null);
      }
    },
    [pending, startSSOFlow, startAppleAuthenticationFlow, legalAccepted, finish],
  );

  const onFinish = useCallback(async () => {
    if (!consentFor || finishing) return;
    setFinishing(true);
    setError(null);
    try {
      if (!(await finish(consentFor))) {
        setError("Couldn't finish creating your account. Try again.");
      }
    } catch (err) {
      setError(clerkError(err, "Couldn't finish creating your account. Try again."));
    } finally {
      setFinishing(false);
    }
  }, [consentFor, finishing, finish]);

  if (consentFor) {
    return (
      <LegalConsentPrompt
        value={consent}
        onValueChange={setConsent}
        busy={finishing}
        error={error}
        onFinish={onFinish}
        onStartOver={() => {
          setConsentFor(null);
          setConsent(false);
          setError(null);
        }}
      />
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <OAuthButton
        label="Continue with Google"
        pending={pending === "google"}
        disabled={pending !== null}
        onPress={() => run("google")}
        icon={<Image source={require("../../assets/icons/google.png")} style={{ width: 18, height: 18 }} />}
      />
      {Platform.OS === "ios" ? (
        <OAuthButton
          label="Continue with Apple"
          pending={pending === "apple"}
          disabled={pending !== null}
          onPress={() => run("apple")}
          icon={<AntDesign name="apple" size={20} color={colors.ink} />}
        />
      ) : null}
      {error ? (
        <Text variant="subtext" color="alert" style={{ textAlign: "center" }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
