import { Linking, Pressable, View } from "react-native";

import { Button, Checkbox, Text } from "@/components/ui";
import { spacing } from "@/theme";
import { fontFamilies } from "@/theme/typography";

/** Must match the Terms / Privacy URLs configured in Clerk → Configure → Legal. */
export const LEGAL_URLS = {
  terms: "https://offerbee.ai/terms",
  privacy: "https://offerbee.ai/privacy-policy",
} as const;

const openLegal = (doc: keyof typeof LEGAL_URLS) =>
  void Linking.openURL(LEGAL_URLS[doc]).catch(() => {});

/**
 * Clerk's "Require express consent to legal documents" is enabled, so every
 * sign-up — email/password or SSO — must carry `legalAccepted`. Clerk reports a
 * missing acceptance as status `missing_requirements` + `missingFields`
 * containing `legal_accepted` instead of throwing, so callers have to check for
 * it explicitly or the flow dead-ends with no error.
 */
export function needsLegalConsent(signUp: unknown): boolean {
  const s = signUp as { status?: string | null; missingFields?: string[] } | null | undefined;
  return s?.status === "missing_requirements" && !!s.missingFields?.includes("legal_accepted");
}

/** Checkbox + tappable Terms / Privacy links. Consent is never pre-checked. */
export function LegalConsentRow({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const link = { fontFamily: fontFamilies.textSemiBold } as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
      <Checkbox
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
      />
      <Text variant="subtext" color="secondary" style={{ flex: 1 }}>
        I agree to the{" "}
        <Text variant="subtext" color="accent" style={link} onPress={() => openLegal("terms")}>
          Terms of Service
        </Text>{" "}
        and{" "}
        <Text variant="subtext" color="accent" style={link} onPress={() => openLegal("privacy")}>
          Privacy Policy
        </Text>
        .
      </Text>
    </View>
  );
}

/**
 * Shown when an SSO sign-in transferred into a sign-up that still needs express
 * consent — the OAuth identity is already verified, so this is the last step
 * before the session activates.
 */
export function LegalConsentPrompt({
  value,
  onValueChange,
  onFinish,
  onStartOver,
  busy = false,
  error,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  onFinish: () => void;
  onStartOver: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <View style={{ gap: spacing.base }}>
      <Text variant="body">
        One more step — accept the terms to finish creating your account.
      </Text>
      <LegalConsentRow value={value} onValueChange={onValueChange} disabled={busy} />
      {error ? (
        <Text variant="subtext" color="alert" style={{ textAlign: "center" }}>
          {error}
        </Text>
      ) : null}
      <Button label="Finish" loading={busy} disabled={!value} onPress={onFinish} />
      <Pressable accessibilityRole="button" disabled={busy} hitSlop={6} onPress={onStartOver}>
        <Text variant="subtext" color="accent" style={{ textAlign: "center" }}>
          Start over
        </Text>
      </Pressable>
    </View>
  );
}
