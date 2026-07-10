"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  SAMPLE_CREDITS,
  derive,
  type Credit,
  type Cycle,
  type Derived,
} from "./data";

export type Theme = "honey" | "onyx";
export type BenefitFilter = Cycle | "all";
export type ExpiringRange = "week" | "month";
export type DashLayout = "A" | "B";

interface AppState {
  // Sample-data domain (no API yet)
  credits: Credit[];
  derived: Derived;
  markUsed: (id: string) => void;
  snooze: (id: string) => void;

  // Theme (persisted). Drives the `.theme-onyx` class on the shell.
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;

  // View-local UI state, hoisted so it survives route changes.
  dashLayout: DashLayout;
  setDashLayout: (l: DashLayout) => void;
  benefitFilter: BenefitFilter;
  setBenefitFilter: (f: BenefitFilter) => void;
  expiringRange: ExpiringRange;
  setExpiringRange: (r: ExpiringRange) => void;
  search: string;
  setSearch: (s: string) => void;
}

const Ctx = createContext<AppState | null>(null);

const THEME_KEY = "offerbee-theme";

export function AppProvider({ children }: { children: ReactNode }) {
  const [credits, setCredits] = useState<Credit[]>(SAMPLE_CREDITS);
  const [theme, setThemeState] = useState<Theme>("honey");
  const [dashLayout, setDashLayout] = useState<DashLayout>("A");
  const [benefitFilter, setBenefitFilter] = useState<BenefitFilter>("monthly");
  const [expiringRange, setExpiringRange] = useState<ExpiringRange>("week");
  const [search, setSearch] = useState("");

  // Restore the persisted theme once mounted. Default-first (honey on both SSR
  // and first client paint) so there is no hydration mismatch; we switch after.
  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "honey" || stored === "onyx") setThemeState(stored);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === "honey" ? "onyx" : "honey"),
    [theme, setTheme],
  );

  const markUsed = useCallback((id: string) => {
    setCredits((cs) =>
      cs.map((c) => (c.id === id ? { ...c, used: !c.used } : c)),
    );
  }, []);

  const snooze = useCallback((id: string) => {
    setCredits((cs) =>
      cs.map((c) => (c.id === id ? { ...c, days: c.days + 30 } : c)),
    );
  }, []);

  const derived = useMemo(() => derive(credits), [credits]);

  const value = useMemo<AppState>(
    () => ({
      credits,
      derived,
      markUsed,
      snooze,
      theme,
      setTheme,
      toggleTheme,
      dashLayout,
      setDashLayout,
      benefitFilter,
      setBenefitFilter,
      expiringRange,
      setExpiringRange,
      search,
      setSearch,
    }),
    [
      credits,
      derived,
      markUsed,
      snooze,
      theme,
      setTheme,
      toggleTheme,
      dashLayout,
      benefitFilter,
      expiringRange,
      search,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}
