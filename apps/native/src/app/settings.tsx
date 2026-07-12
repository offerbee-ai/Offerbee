import { Alert, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import {
  DEFAULT_REMINDER_PREFS,
  type ReminderPrefs,
} from "@packages/backend/convex/onboardingCatalog";

import {
  Avatar,
  Button,
  Card,
  PillButton,
  Screen,
  SectionLabel,
  SegmentedControl,
  Text,
  Toggle,
} from "@/components/ui";
import { InlineHeader } from "@/components/navigation/InlineHeader";
import { spacing, useTheme } from "@/theme";
import { appEnv } from "@/lib/env";

const NOTIF: { key: keyof ReminderPrefs; title: string; desc: string }[] = [
  { key: "expiry", title: "Expiry alerts", desc: "A nudge before each credit resets" },
  { key: "digest", title: "Weekly digest", desc: "Monday summary of what's available" },
  { key: "renewal", title: "Renewal alerts", desc: "30 days before an annual fee posts" },
  { key: "smart", title: "Smart reminders", desc: "Only when a credit is realistically usable" },
];

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
  const prefs = me?.reminderPrefs ?? DEFAULT_REMINDER_PREFS;

  const name = user?.fullName ?? me?.name ?? "OfferBee member";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initial = (name || email || "?").trim().charAt(0);
  const memberSince = user?.createdAt ? new Date(user.createdAt).getFullYear() : null;

  const setReminder = (key: keyof ReminderPrefs, value: boolean) => {
    updatePrefs({ reminderPrefs: { ...prefs, [key]: value } }).catch((e) =>
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
  const onManage = () =>
    Alert.alert("Manage plan", "Subscription management is coming soon.");
  const onExport = () =>
    Alert.alert("Export data", "CSV export is coming soon.");

  return (
    <Screen>
      <InlineHeader backLabel="Review" onBack={() => router.back()} title="Settings" />

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
            value={prefs[n.key]}
            onToggle={(v) => setReminder(n.key, v)}
            separator={i < NOTIF.length - 1}
          />
        ))}
      </Card>

      {/* Plan */}
      <SectionLabel>Plan</SectionLabel>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.base }}>
        <View style={{ flex: 1 }}>
          <Text variant="body">OfferBee Pro</Text>
          <Text variant="subtext" color="secondary" style={{ marginTop: 2 }}>
            $4/mo · unlimited cards · renews Aug 12
          </Text>
        </View>
        <PillButton label="Manage" tone="soft" onPress={onManage} />
      </Card>

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
