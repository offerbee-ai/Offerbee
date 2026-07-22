import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";

import { Icon, Text } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useEntitlement, useTrialLedger } from "@/features/billing/useEntitlement";
import { useOpenCheckout } from "@/features/billing/openCheckout";

// Mirrors the backend's checkout trial_end cutoff (billing.ts): further out,
// Stripe bills at trial end; closer in, checkout charges immediately and the
// no-charge fine print is dropped.
const TRIAL_END_CUTOFF_MS = 48 * 60 * 60 * 1000;

// Fixed "statement" palette for the ledger panel — same in both themes
// (design rule: it's a ledger of real numbers, not a theme-mapped surface).
const LEDGER = { bg: "#211D16", ink: "#F4F0E6", accent: "#F59E3C" };

const FEATURES = [
  "Credit detection & reset reminders",
  "Fee-vs-value verdict at each renewal",
  "Unlimited cards & full history",
];

const PLANS = {
  yearly: { name: "Yearly", price: "$80", per: "/yr", sub: "$6.67/mo · save 33%", cta: "Subscribe yearly — $80/yr" },
  monthly: { name: "Monthly", price: "$9.99", per: "/mo", sub: "Cancel anytime", cta: "Subscribe monthly — $9.99/mo" },
} as const;

const fmtMoney = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

// Trial paywall per Design/design_handoff_paywall (screen 2b). Reached two
// ways: pushed voluntarily during the trial (modal, close button shown) or as
// the hard gate once access lapses (_layout guard — only screen, no close).
// Stripe Checkout (in-app browser) hosts all payment UI; the entitlement query
// is reactive, so the hard gate dismisses itself once the webhook lands.
export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const entitlement = useEntitlement();
  const ledger = useTrialLedger();
  const openCheckout = useOpenCheckout();
  const [selected, setSelected] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Snapshot at mount — this screen is short-lived, so the countdown doesn't
  // need to tick (and reading Date.now() in render trips react purity).
  const [now] = useState(() => Date.now());

  const trialEndsAt = entitlement?.trialEndsAt ?? null;
  const status = entitlement?.status ?? "trialing";
  const trialDaysLeft =
    trialEndsAt !== null ? Math.max(0, Math.ceil((trialEndsAt - now) / 86_400_000)) : null;
  const billedAtTrialEnd = trialEndsAt !== null && trialEndsAt - now > TRIAL_END_CUTOFF_MS;

  // Always closeable (product call): the sheet is pushed over the tabs both on
  // voluntary in-trial visits and as the every-app-open nag once access lapses.
  // Closing while lapsed only lets the user look around — every feature write
  // is blocked server-side (SUBSCRIPTION_REQUIRED) and the nag returns on the
  // next launch.
  const canClose = router.canGoBack();
  const hasAccess = entitlement?.hasAccess ?? false;

  // Voluntary visit: once checkout completes (webhook sets the plan while the
  // in-app browser is still up), drop back to the app instead of re-pitching.
  // hasAccess must gate this: a canceled subscriber keeps a non-null plan on
  // the row, and dismissing on plan alone would close the resubscribe paywall
  // the instant it opens.
  const plan = entitlement?.plan ?? null;
  useEffect(() => {
    if (hasAccess && plan !== null && router.canGoBack()) router.back();
  }, [hasAccess, plan]);

  const headline =
    trialDaysLeft && trialDaysLeft > 0
      ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your trial`
      : status === "trialing"
        ? "Your trial has ended"
        : "Your subscription has ended";

  const showLedger = !!ledger && ledger.total > 0 && ledger.items.length > 0;
  const ledgerItems = showLedger ? ledger.items.slice(0, 2) : [];

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      await openCheckout(selected);
    } catch {
      setError("Couldn't start checkout. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    // No insets.top: the modal sheet presentation already hangs below the
    // status bar, so adding the safe-area inset doubles the top gap.
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.base,
          paddingBottom: spacing.xl,
          gap: spacing.base,
        }}
      >
        <View style={{ minHeight: 32, alignItems: "flex-end" }}>
          {canClose ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => router.back()}
              disabled={busy}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.field,
                alignItems: "center",
                justifyContent: "center",
                opacity: busy ? 0.6 : pressed ? 0.7 : 1,
              })}
            >
              <Icon name="close" size={16} color="secondary" />
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="sectionLabel" color="accent">
            OfferBee Pro
          </Text>
          <Text variant="title" style={{ fontSize: 28, lineHeight: 34 }}>
            {headline}
          </Text>
          <Text variant="bodyRegular" color="secondary">
            Reminders before resets, fee-vs-value verdicts, automatic credit detection.
          </Text>
        </View>

        {ledger === undefined ? (
          // Query still in flight: hold the ledger's exact footprint (header +
          // 2 rows + note) so the plan rows don't jump when it resolves. Users
          // with $0 captured see this collapse — brief, and rarer than the
          // ledger case for trial users.
          <View
            style={{
              backgroundColor: LEDGER.bg,
              borderRadius: radius.card,
              padding: spacing.lg,
              gap: spacing.sm,
            }}
          >
            {[112, 180, 150, 200].map((w, i) => (
              <View
                key={i}
                style={{
                  width: w,
                  height: i === 0 ? 14 : 12,
                  borderRadius: 6,
                  backgroundColor: "rgba(244, 240, 230, 0.14)",
                  marginVertical: 3,
                }}
              />
            ))}
          </View>
        ) : showLedger ? (
          <View
            style={{
              backgroundColor: LEDGER.bg,
              borderRadius: radius.card,
              padding: spacing.lg,
              gap: spacing.sm,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text variant="sectionLabel" style={{ color: LEDGER.accent }}>
                Your trial so far
              </Text>
              <Text variant="figureS" style={{ color: LEDGER.accent, fontSize: 20, lineHeight: 25 }}>
                {fmtMoney(ledger.total)}
              </Text>
            </View>
            {ledgerItems.map((it, i) => (
              <View
                key={i}
                style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.md }}
              >
                <Text variant="subtext" style={{ color: LEDGER.ink, flexShrink: 1 }} numberOfLines={1}>
                  {it.title} · {it.cardName}
                  {it.count > 1 ? ` × ${it.count}` : ""}
                </Text>
                <Text variant="mono" style={{ color: LEDGER.ink }}>
                  {fmtMoney(it.amount)}
                </Text>
              </View>
            ))}
            <Text variant="subtext" style={{ color: LEDGER.ink, opacity: 0.85 }}>
              A year of Pro costs <Text variant="subtext" style={{ color: LEDGER.accent }}>$80</Text> —{" "}
              {ledger.total > 80 ? "less than OfferBee found in your trial." : "it pays for itself."}
            </Text>
          </View>
        ) : null}

        {(["yearly", "monthly"] as const).map((id) => {
          const p = PLANS[id];
          const active = selected === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              disabled={busy}
              onPress={() => setSelected(id)}
              style={{
                borderWidth: 2,
                borderColor: active ? colors.accent : colors.border,
                backgroundColor: colors.surface,
                borderRadius: radius.card,
                paddingVertical: spacing.base,
                paddingHorizontal: spacing.lg,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                opacity: busy ? 0.6 : 1,
                ...(active
                  ? {
                      shadowColor: colors.accent,
                      shadowOpacity: 0.18,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 3,
                    }
                  : null),
              }}
            >
              {id === "yearly" ? (
                <View
                  style={{
                    position: "absolute",
                    top: -10,
                    right: spacing.base,
                    backgroundColor: colors.accent,
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text variant="sectionLabel" color="onAccent" style={{ fontSize: 10 }}>
                    Best value
                  </Text>
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text variant="body">{p.name}</Text>
                <Text variant="subtext" color="secondary" style={{ marginTop: 1 }}>
                  {p.sub}
                </Text>
              </View>
              <Text variant="figureS" style={{ fontSize: 20, lineHeight: 25 }}>
                {p.price}
                <Text variant="subtext" color="secondary">
                  {" "}
                  {p.per}
                </Text>
              </Text>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: active ? colors.accent : "transparent",
                  borderWidth: active ? 0 : 1.5,
                  borderColor: colors.circleEmpty,
                }}
              >
                {active ? <Icon name="check" size={13} color="onAccent" /> : null}
              </View>
            </Pressable>
          );
        })}

        <View style={{ gap: spacing.md, paddingVertical: spacing.xs }}>
          {FEATURES.map((f) => (
            <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Icon name="check" size={16} color="accent" />
              <Text variant="bodyRegular" style={{ flexShrink: 1 }}>
                {f}
              </Text>
            </View>
          ))}
        </View>

        {error ? (
          <Text variant="caption" color="alert" style={{ textAlign: "center" }}>
            {error}
          </Text>
        ) : null}
      </ScrollView>

      {/* Pinned CTA — label follows the selected plan */}
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: Math.max(insets.bottom, spacing.base),
          gap: spacing.sm,
          borderTopWidth: 1,
          borderTopColor: colors.separator,
          backgroundColor: colors.background,
        }}
      >
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void buy()}
          style={({ pressed }) => ({
            height: 50,
            borderRadius: radius.button,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
            opacity: busy ? 0.6 : pressed ? 0.9 : 1,
          })}
        >
          <Text variant="button" color="onAccent">
            {busy ? "Opening…" : PLANS[selected].cta}
          </Text>
        </Pressable>
        <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
          {billedAtTrialEnd ? "You won't be charged until your trial ends · " : ""}
          <Text
            variant="caption"
            color="tertiary"
            style={{ textDecorationLine: "underline" }}
            onPress={() => void Linking.openURL("https://offerbee.ai/terms")}
          >
            Terms
          </Text>
        </Text>
        {!hasAccess ? (
          <Pressable disabled={busy} onPress={() => void signOut()}>
            <Text
              variant="caption"
              color="secondary"
              style={{ textAlign: "center", opacity: busy ? 0.6 : 1 }}
            >
              Sign out
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
