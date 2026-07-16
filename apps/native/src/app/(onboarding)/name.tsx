import { useEffect, useRef, useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/clerk-expo";
import { api } from "@packages/backend/convex/_generated/api";

import { Button, Text } from "@/components/ui";
import { fontFamilies, radius, spacing, useTheme } from "@/theme";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { StepChrome } from "@/features/onboarding/StepChrome";

// Onboarding step 1 — post-signup name confirm (native port of web StepName).
// Email-only signups arrive with no Clerk name; capture first/last here,
// prefilled when a provider supplied one, then dual-write Clerk + Convex.
export default function OnboardingName() {
  const { setStep } = useOnboarding();
  const me = useQuery(api.users.getMe);
  const { user } = useUser();
  const setProfileName = useMutation(api.users.setProfileName);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const prefilled = useRef(false);

  useEffect(() => setStep(1), [setStep]);

  // Prefill once from Convex or Clerk without clobbering typing.
  useEffect(() => {
    if (prefilled.current || me === undefined) return;
    prefilled.current = true;
    const parts = (user?.fullName ?? "").trim().split(/\s+/).filter(Boolean);
    setFirstName(me?.firstName ?? user?.firstName ?? parts[0] ?? "");
    setLastName(
      me?.lastName ?? user?.lastName ?? parts.slice(1).join(" ") ?? "",
    );
  }, [me, user]);

  // Already have a name (returning user / provider signup)? Skip the step.
  useEffect(() => {
    if (me === undefined) return;
    const has = Boolean(
      (me?.firstName ?? me?.name ?? user?.firstName ?? user?.fullName)?.trim(),
    );
    if (has) router.replace("/(onboarding)/connect");
  }, [me, user]);

  const canSave = firstName.trim().length > 0 && !saving;

  const onContinue = async () => {
    if (!canSave) return;
    const first = firstName.trim();
    const last = lastName.trim();
    setSaving(true);
    try {
      // Clerk is the identity source the app's render sites read from.
      if (user) await user.update({ firstName: first, lastName: last });
      // Mirror to Convex for server-side use (welcome email, Brevo, settings).
      await setProfileName({ firstName: first, lastName: last || undefined });
      router.replace("/(onboarding)/connect");
    } catch (e) {
      console.error("saveProfileName failed", e);
      setSaving(false);
    }
  };

  return (
    <StepChrome
      step={1}
      title="What should we call you?"
      subtitle="We use your name on your dashboard and in reminders. You can change it anytime in Settings."
      hideBar
    >
      <View style={{ gap: spacing.base }}>
        <Field
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Jordan"
          textContentType="givenName"
          autoFocus
          returnKeyType="next"
        />
        <Field
          label="Last name (optional)"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Rivera"
          textContentType="familyName"
          returnKeyType="done"
          onSubmitEditing={() => void onContinue()}
        />
        <View style={{ marginTop: spacing.sm }}>
          <Button
            label="Continue"
            disabled={!canSave}
            loading={saving}
            onPress={() => void onContinue()}
          />
        </View>
      </View>
    </StepChrome>
  );
}

function Field({ label, ...rest }: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 7 }}>
      <Text variant="sectionLabel" color="secondary" style={{ fontSize: 13 }}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.tertiary}
        autoCorrect={false}
        style={{
          backgroundColor: colors.field,
          borderRadius: radius.chip,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontFamily: fontFamilies.text,
          fontSize: 15,
          color: colors.ink,
        }}
        {...rest}
      />
    </View>
  );
}
