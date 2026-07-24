import * as Location from "expo-location";

// Foreground (When-In-Use) location helpers for the Phase 2 "Near you" feature.
// No background/Always permission — that's Phase 3. Every call is wrapped so a
// simulator/Expo Go without the native module degrades gracefully rather than
// throwing into the UI.

export type LocationPermission = "granted" | "denied" | "undetermined";

/** Current foreground permission, without prompting. "undetermined" also covers
 *  the unavailable/error case so callers treat it as "safe to offer, not yet asked". */
export async function getForegroundLocationStatus(): Promise<LocationPermission> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === "granted") return "granted";
    if (status === "denied") return "denied";
    return "undetermined";
  } catch {
    return "undetermined";
  }
}

/** Prompt for When-In-Use permission. Returns true only if granted. */
export async function requestForegroundLocation(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/** A single position fix (balanced accuracy). null if permission/hardware fails. */
export async function getCurrentCoords(): Promise<{
  lat: number;
  lng: number;
} | null> {
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}
