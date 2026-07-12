import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
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
