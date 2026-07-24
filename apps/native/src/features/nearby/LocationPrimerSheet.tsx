import { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Button, Icon, Text } from "@/components/ui";
import { spacing, useTheme } from "@/theme";
import {
  getForegroundLocationStatus,
  requestForegroundLocation,
} from "@/lib/location";

// One-time "Near you" location primer, shown on the overview screen the first
// time the user lands there with location still undetermined. Priming (explain
// the value first, then trigger the OS dialog) follows the notification primer
// pattern in (onboarding)/primer.tsx — never fire the raw OS prompt cold.
const DISMISSED_KEY = "nearby.locationPrimerDismissed";

export function LocationPrimerSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Only offer when we've never asked AND the user hasn't waved it off.
        const status = await getForegroundLocationStatus();
        if (status !== "undetermined") return;
        const dismissed = await AsyncStorage.getItem(DISMISSED_KEY);
        if (dismissed) return;
        // Small beat so it reads as a pop-out over the rendered screen.
        setTimeout(() => {
          if (!cancelled) setVisible(true);
        }, 600);
      } catch {
        // Permission/storage probe failed (e.g. no native module or storage
        // unavailable) — stay hidden rather than surface a rejection or nag.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const close = () => setVisible(false);

  const enable = async () => {
    setBusy(true);
    try {
      await requestForegroundLocation();
    } finally {
      // Whatever the user chose in the OS dialog, don't show this again — the
      // status is no longer "undetermined" so the guard above won't re-trigger.
      setBusy(false);
      close();
    }
  };

  const notNow = async () => {
    // Persistence is best-effort — dismiss this session regardless so a rejected
    // write can't leave the sheet stuck open or surface an unhandled rejection.
    try {
      await AsyncStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore: worst case the primer may reappear on a later launch
    } finally {
      close();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={notNow}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.42)",
          }}
          onPress={notNow}
        />
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingBottom: 22 + insets.bottom,
          }}
        >
          {/* Grabber */}
          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.track,
              }}
            />
          </View>

          <View
            style={{
              alignItems: "center",
              gap: spacing.base,
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.md,
            }}
          >
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                backgroundColor: colors.accentSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="mapPin" size={34} color="accent" />
            </View>
            <Text
              style={{
                fontFamily: "SourceSerif4_600SemiBold",
                fontSize: 26,
                lineHeight: 32,
                textAlign: "center",
                color: colors.ink,
              }}
            >
              See credits near you
            </Text>
            <Text
              variant="bodyRegular"
              color="secondary"
              style={{ textAlign: "center", maxWidth: 300 }}
            >
              Turn on location and OfferBee shows the card credits you can use at
              stores right around you — checked only while the app is open.
            </Text>
          </View>

          <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, marginTop: spacing.lg }}>
            <Button label="Enable location" onPress={enable} loading={busy} />
            <Button label="Not now" variant="ghost" onPress={notNow} />
            <Text
              variant="sectionLabel"
              color="tertiary"
              style={{ fontSize: 10, textAlign: "center", marginTop: spacing.xs }}
            >
              Change anytime in settings
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
