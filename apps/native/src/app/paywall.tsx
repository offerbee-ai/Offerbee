import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";

import { Badge, Text } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useEntitlement } from "@/features/billing/useEntitlement";
import { useOpenCheckout } from "@/features/billing/openCheckout";

const PLANS = [
  { id: "monthly" as const, name: "Monthly", price: "$9.99", per: "/month", note: "Cancel anytime" },
  {
    id: "yearly" as const,
    name: "Yearly",
    price: "$80",
    per: "/year",
    note: "$6.67/mo — save 33%",
    badge: "Best value",
  },
];

// Full-screen hard paywall. Stripe Checkout (opened in an in-app browser)
// hosts all payment UI; the only exit without paying is Sign out. The
// entitlement query is reactive, so this screen's guard dismisses itself once
// the checkout webhook lands.
export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const entitlement = useEntitlement();
  const openCheckout = useOpenCheckout();
  const [busy, setBusy] = useState<"monthly" | "yearly" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Snapshot at mount — this screen is short-lived, so the countdown doesn't
  // need to tick (and reading Date.now() in render trips react purity).
  const [now] = useState(() => Date.now());

  const trialEndsAt = entitlement?.trialEndsAt ?? null;
  const status = entitlement?.status ?? "trialing";
  const trialDaysLeft =
    trialEndsAt !== null ? Math.max(0, Math.ceil((trialEndsAt - now) / 86_400_000)) : null;

  const headline =
    trialDaysLeft && trialDaysLeft > 0
      ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your trial`
      : status === "trialing"
        ? "Your free trial has ended"
        : "Your subscription has ended";

  const buy = async (plan: "monthly" | "yearly") => {
    setBusy(plan);
    setError(null);
    try {
      await openCheckout(plan);
    } catch {
      setError("Couldn't start checkout. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
        paddingBottom: Math.max(insets.bottom, spacing.lg),
      }}
    >
      <View
        style={{
          flex: 1,
          paddingHorizontal: spacing.xl,
          justifyContent: "center",
          gap: spacing.base,
        }}
      >
        <Text variant="title" style={{ textAlign: "center" }}>
          {headline}
        </Text>
        <Text variant="bodyRegular" color="secondary" style={{ textAlign: "center", maxWidth: 340, alignSelf: "center" }}>
          Keep every statement credit working for you — reminders before resets,
          fee-vs-value verdicts at renewal, and automatic credit detection.
        </Text>

        {PLANS.map((p) => (
          <Pressable
            key={p.id}
            disabled={busy !== null}
            onPress={() => buy(p.id)}
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: radius.card,
              padding: spacing.lg,
              gap: spacing.xs,
              opacity: busy !== null ? 0.6 : pressed ? 0.9 : 1,
            })}
          >
            {p.badge ? <Badge label={p.badge} /> : null}
            <Text variant="body" color="secondary">
              {p.name}
            </Text>
            <Text variant="title">
              {p.price}
              <Text variant="bodyRegular" color="secondary">
                {" "}
                {p.per}
              </Text>
            </Text>
            <Text variant="caption" color="secondary">
              {p.note}
            </Text>
            <View
              style={{
                marginTop: spacing.sm,
                height: 44,
                borderRadius: radius.button,
                backgroundColor: colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text variant="button" color="onAccent">
                {busy === p.id ? "Opening…" : "Subscribe"}
              </Text>
            </View>
          </Pressable>
        ))}

        {error ? (
          <Text variant="caption" color="alert" style={{ textAlign: "center" }}>
            {error}
          </Text>
        ) : null}

        <Pressable disabled={busy !== null} onPress={() => void signOut()}>
          <Text
            variant="caption"
            color="secondary"
            style={{ textAlign: "center", opacity: busy !== null ? 0.6 : 1 }}
          >
            Sign out
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
