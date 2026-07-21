import { useState } from "react";
import { Alert, View } from "react-native";
import Constants from "expo-constants";
import { useAuth, useUser } from "@clerk/expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import {
  DEFAULT_NOTIFICATION_CATEGORIES,
  type NotificationCategories,
} from "@packages/backend/convex/onboardingCatalog";

import {
  Avatar,
  Button,
  Card,
  Screen,
  SectionLabel,
  SegmentedControl,
  Text,
  Toggle,
} from "@/components/ui";
import { InlineHeader } from "@/components/navigation/InlineHeader";
import { PlaidConnectSection } from "@/features/plaid/PlaidConnectSection";
import { useEntitlement } from "@/features/billing/useEntitlement";
import { useOpenPortal } from "@/features/billing/openCheckout";
import { goBack } from "@/features/nav/back";
import { spacing, useTheme } from "@/theme";
import { appEnv } from "@/lib/env";

const NOTIF = [
  { key: "expiry", title: "Expiry alerts", desc: "A nudge before each credit resets" },
  { key: "digest", title: "Weekly digest", desc: "Monday summary of what's available" },
  { key: "renewal", title: "Renewal alerts", desc: "Annual fees and signup deadlines" },
  { key: "transactions", title: "Detected credits", desc: "When we spot a credit you can confirm" },
] as const;

function ToggleRow({
  title,
  desc,
  value,
  onToggle,
  separator,
}: {
  title: string;
  desc: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  separator: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingVertical: spacing.rowPadY,
          paddingHorizontal: spacing.rowPadX,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="body">{title}</Text>
          <Text variant="subtext" color="secondary" style={{ marginTop: 1 }}>
            {desc}
          </Text>
        </View>
        <Toggle value={value} onValueChange={onToggle} accessibilityLabel={title} />
      </View>
      {separator ? (
        <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: spacing.rowPadX }} />
      ) : null}
    </View>
  );
}

export default function SettingsScreen() {
  const { isDark, setPreference } = useTheme();
  const { user } = useUser();
  const { signOut } = useAuth();

  const me = useQuery(api.users.getMe);
  const updatePrefs = useMutation(api.users.updateNotificationPrefs);
  const cats = me?.notificationCategories ?? DEFAULT_NOTIFICATION_CATEGORIES;

  const entitlement = useEntitlement();
  const openPortal = useOpenPortal();
  // Snapshot for the trial countdown — avoids reading Date.now() in render.
  const [now] = useState(() => Date.now());

  const plan = entitlement?.plan ?? null;
  const isSubscribed = plan !== null;
  const currentPeriodEnd = entitlement?.currentPeriodEnd ?? null;
  const cancelAtPeriodEnd = entitlement?.cancelAtPeriodEnd ?? false;
  const trialEndsAt = entitlement?.trialEndsAt ?? null;
  const periodDate =
    currentPeriodEnd !== null
      ? new Date(currentPeriodEnd).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;
  const trialDaysLeft =
    trialEndsAt !== null ? Math.max(0, Math.ceil((trialEndsAt - now) / 86_400_000)) : null;

  const billingTitle = isSubscribed
    ? `OfferBee Premium — ${plan === "yearly" ? "Yearly" : "Monthly"}`
    : "Free trial";
  const billingSubtitle = isSubscribed
    ? periodDate
      ? cancelAtPeriodEnd
        ? `Ends ${periodDate}`
        : `Renews ${periodDate}`
      : cancelAtPeriodEnd
        ? "Cancels at period end"
        : "Active"
    : trialDaysLeft !== null
      ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`
      : "Active";

  const name = user?.fullName ?? me?.name ?? "OfferBee member";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initial = (name || email || "?").trim().charAt(0);
  const memberSince = user?.createdAt ? new Date(user.createdAt).getFullYear() : null;

  const setCategory = (key: keyof NotificationCategories, value: boolean) => {
    updatePrefs({ notificationCategories: { ...cats, [key]: value } }).catch((e) =>
      console.error("updateNotificationPrefs failed", e),
    );
  };

  const onSignOut = () => {
    Alert.alert("Sign out?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  const onEdit = () =>
    Alert.alert("Edit profile", "Profile editing is coming soon.");
  const onExport = () =>
    Alert.alert("Export data", "CSV export is coming soon.");

  return (
    <Screen>
      <InlineHeader backLabel="Review" onBack={() => goBack("/")} title="Settings" />

      {/* Profile */}
      <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.base }}>
        <Avatar
          initial={initial}
          imageUrl={user?.hasImage ? user.imageUrl : null}
          size={54}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "SourceSerif4_600SemiBold", fontSize: 19, lineHeight: 24 }} numberOfLines={1}>
            {name}
          </Text>
          <Text variant="subtext" color="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
            {email}
            {memberSince ? ` · member since ${memberSince}` : ""}
          </Text>
        </View>
        <Button label="Edit" variant="secondary" size="sm" haptic={false} onPress={onEdit} />
      </Card>

      {/* Appearance */}
      <SectionLabel>Appearance</SectionLabel>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.base }}>
          <Text variant="body">Theme</Text>
          <View style={{ flex: 1, maxWidth: 200 }}>
            <SegmentedControl
              options={[
                { value: "light", label: "Honey" },
                { value: "dark", label: "Onyx" },
              ]}
              value={isDark ? "dark" : "light"}
              onChange={(v) => setPreference(v as "light" | "dark")}
            />
          </View>
        </View>
      </Card>

      {/* Notifications */}
      <SectionLabel>Notifications</SectionLabel>
      <Card padded={false}>
        {NOTIF.map((n, i) => (
          <ToggleRow
            key={n.key}
            title={n.title}
            desc={n.desc}
            value={cats[n.key]}
            onToggle={(v) => setCategory(n.key, v)}
            separator={i < NOTIF.length - 1}
          />
        ))}
      </Card>

      {/* Billing */}
      {entitlement ? (
        <>
          <SectionLabel>Billing</SectionLabel>
          <Card padded={false}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.base,
                paddingVertical: spacing.rowPadY,
                paddingHorizontal: spacing.rowPadX,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="body">{billingTitle}</Text>
                <Text variant="subtext" color="secondary" style={{ marginTop: 1 }}>
                  {billingSubtitle}
                </Text>
              </View>
              {isSubscribed ? (
                <Button
                  label="Manage"
                  variant="secondary"
                  size="sm"
                  haptic={false}
                  onPress={() => void openPortal()}
                />
              ) : null}
            </View>
          </Card>
        </>
      ) : null}

      {/* Connected accounts (Plaid) */}
      <PlaidConnectSection />

      {/* Account actions */}
      <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
        <Button label="Export data (CSV)" variant="secondary" haptic={false} onPress={onExport} />
        <Button label="Sign out" variant="destructive" haptic={false} onPress={onSignOut} />
      </View>

      <Text variant="caption" color="tertiary" style={{ marginTop: spacing.lg, textAlign: "center" }}>
        OfferBee {Constants.expoConfig?.version ?? "1.0.0"} · {appEnv}
      </Text>
    </Screen>
  );
}
