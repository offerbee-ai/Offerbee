import { Tabs } from "expo-router";

import { TabBar } from "@/components/navigation/TabBar";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={({ state, navigation }) => <TabBar state={state} navigation={navigation} />}
      screenOptions={{
        headerShown: false,
        // Content scrolls under the floating glass bar; screens pad via TAB_BAR_CLEARANCE.
        sceneStyle: { backgroundColor: "transparent" },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="benefits" />
      <Tabs.Screen name="expiring" />
      <Tabs.Screen name="cards" />
    </Tabs>
  );
}
