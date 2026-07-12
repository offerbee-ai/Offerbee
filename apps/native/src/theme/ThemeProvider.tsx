import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Appearance, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { themes, type ThemeColors, type ThemeName } from "./tokens";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "offerbee.themePreference";

type ThemeContextValue = {
  /** Resolved theme name: honey = light, onyx = dark. */
  theme: ThemeName;
  colors: ThemeColors;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === "system" || stored === "light" || stored === "dark") {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Persistence is best-effort; the in-memory value still applies.
    });
  }, []);

  // Force the *native* appearance to match the app theme so native UI — the iOS
  // 26 Liquid Glass tab bar especially — doesn't render with the OS appearance
  // (which caused a light bar in the app's dark theme until an interaction
  // refreshed the trait collection). `null` restores OS control for "system".
  useEffect(() => {
    // `null` clears the override so "system" follows the OS. RN 0.86 types
    // setColorScheme as 'light' | 'dark' only, but null is the documented reset.
    const scheme = preference === "system" ? null : preference === "dark" ? "dark" : "light";
    Appearance.setColorScheme(scheme as "light" | "dark");
  }, [preference]);

  const resolved: ThemeName =
    preference === "system"
      ? systemScheme === "dark"
        ? "onyx"
        : "honey"
      : preference === "dark"
        ? "onyx"
        : "honey";

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: resolved,
      colors: themes[resolved],
      isDark: resolved === "onyx",
      preference,
      setPreference,
    }),
    [resolved, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
