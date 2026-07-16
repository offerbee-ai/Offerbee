import { NativeTabs } from "expo-router/unstable-native-tabs";

import { useTheme } from "@/theme";

// App accent (brand orange) — the selected tab tint, replacing the system blue.
const ACCENT = "#E8680E";

// Apple's native iOS 26 tab bar — floating Liquid Glass with the system-owned
// sliding/drag selection. Native gesture + morph come from UIKit itself, so
// there's nothing to hand-roll. Icons are SF Symbols (filled when selected).
export default function TabsLayout() {
  // Pin the bar's material to the *app* theme. The default adaptive
  // `systemChromeMaterial` follows the system appearance, so it flips to light
  // in the app's dark theme when the device is light — hence the white-bar flicker.
  const { isDark } = useTheme();
  return (
    <NativeTabs
      tintColor={ACCENT}
      labelStyle={{ selected: { color: ACCENT } }}
      blurEffect={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} />
        <NativeTabs.Trigger.Label>Review</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="benefits">
        <NativeTabs.Trigger.Icon sf="checklist" />
        <NativeTabs.Trigger.Label>Benefits</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="expiring">
        <NativeTabs.Trigger.Icon sf={{ default: "clock", selected: "clock.fill" }} />
        <NativeTabs.Trigger.Label>Expiring</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cards">
        <NativeTabs.Trigger.Icon sf={{ default: "creditcard", selected: "creditcard.fill" }} />
        <NativeTabs.Trigger.Label>Cards</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
