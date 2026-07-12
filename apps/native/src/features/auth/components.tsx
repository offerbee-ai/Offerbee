import { useCallback, useState } from "react";
import { Image, Pressable, TextInput, View, type TextInputProps } from "react-native";
import { AntDesign } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useSSO } from "@clerk/clerk-expo";

import { Text } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { fontFamilies } from "@/theme/typography";

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

type Strategy = "oauth_google" | "oauth_apple";

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
 * Google + Apple OAuth buttons wired to Clerk SSO. On success setActive flips
 * the root Stack.Protected gate to onboarding/tabs — no manual navigation.
 * (Design shows Google only; Apple is kept per product decision.)
 */
export function OAuthButtons() {
  const { colors } = useTheme();
  const { startSSOFlow } = useSSO();
  const [pending, setPending] = useState<Strategy | null>(null);

  const run = useCallback(
    async (strategy: Strategy) => {
      if (pending) return;
      setPending(strategy);
      try {
        const { createdSessionId, setActive } = await startSSOFlow({ strategy });
        if (createdSessionId && setActive) await setActive({ session: createdSessionId });
      } catch (err) {
        if (!String(err).includes("already signed in")) console.error("OAuth error", err);
      } finally {
        setPending(null);
      }
    },
    [pending, startSSOFlow],
  );

  return (
    <View style={{ gap: spacing.md }}>
      <OAuthButton
        label="Continue with Google"
        pending={pending === "oauth_google"}
        disabled={pending !== null}
        onPress={() => run("oauth_google")}
        icon={<Image source={require("../../assets/icons/google.png")} style={{ width: 18, height: 18 }} />}
      />
      <OAuthButton
        label="Continue with Apple"
        pending={pending === "oauth_apple"}
        disabled={pending !== null}
        onPress={() => run("oauth_apple")}
        icon={<AntDesign name="apple" size={20} color={colors.ink} />}
      />
    </View>
  );
}
