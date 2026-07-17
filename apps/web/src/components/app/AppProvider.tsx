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
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import {
  cardColor,
  derive,
  type CardBase,
  type Credit,
  type Cycle,
  type Derived,
} from "./data";

export type Theme = "honey" | "onyx";
export type BenefitFilter = Cycle | "all";
export type ExpiringRange = "week" | "month";
export type DashLayout = "A" | "B";

interface AppState {
  // Live credit-tracking domain (Convex).
  credits: Credit[];
  cards: CardBase[];
  derived: Derived;
  isLoading: boolean;
  markUsed: (id: string) => void; // one-tap: fill remaining, or clear if used
  logPartial: (id: string, amount: number) => void;
  snooze: (id: string) => void;
  pending: Set<string>; // ids with an in-flight mutation (disable buttons)

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
const DAY_MS = 86_400_000;

export function AppProvider({ children }: { children: ReactNode }) {
  const data = useQuery(api.benefits.listMyCredits);
  const logUsageM = useMutation(api.benefits.logUsage);
  const clearPeriodM = useMutation(api.benefits.clearCurrentPeriod);
  const snoozeM = useMutation(api.benefits.snoozeBenefit);

  const [theme, setThemeState] = useState<Theme>("honey");
  const [dashLayout, setDashLayout] = useState<DashLayout>("A");
  const [benefitFilter, setBenefitFilter] = useState<BenefitFilter>("monthly");
  const [expiringRange, setExpiringRange] = useState<ExpiringRange>("week");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());

  // A clock that ticks each minute so day-countdowns stay reactive without a
  // server round-trip (query results don't re-evaluate as wall-clock advances).
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Restore the persisted theme once mounted (default-first to avoid mismatch).
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

  const cards = useMemo<CardBase[]>(
    () =>
      (data?.cards ?? []).map((c) => ({
        id: c.cardKey,
        name: c.name,
        color: cardColor(c.cardKey),
        image: c.imageUrl ?? null,
        fee: c.fee,
        terms: c.fee > 0 ? `$${c.fee} / yr` : "No annual fee",
      })),
    [data],
  );

  const credits = useMemo<Credit[]>(
    () =>
      (data?.credits ?? []).map((c) => ({
        id: c.id,
        name: c.title,
        card: c.cardName,
        cardId: c.cardKey,
        color: cardColor(c.cardKey),
        image: c.cardImageUrl ?? null,
        amount: c.amount,
        cycle: c.cycle,
        usedAmount: c.usedAmount,
        // Fall back to current-period captured if a not-yet-deployed backend
        // omits capturedYtd, so aggregates never go NaN mid-rollout.
        capturedYtd: c.capturedYtd ?? Math.min(c.usedAmount, c.amount),
        used: c.usedAmount >= c.amount,
        days: Math.max(0, Math.ceil((c.resetAt - now) / DAY_MS)),
        resetAt: c.resetAt,
        snoozed: (c.snoozedUntil ?? 0) > now,
        periods: c.periods ?? undefined,
      })),
    [data, now],
  );

  const derived = useMemo(() => derive(credits, cards), [credits, cards]);

  // Wrap a mutation so the target id's buttons disable while it's in flight.
  const runPending = useCallback(
    async (id: string, fn: () => Promise<unknown>) => {
      setPending((p) => new Set(p).add(id));
      try {
        await fn();
      } catch (e) {
        console.error("benefit mutation failed", e);
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(id);
          return next;
        });
      }
    },
    [],
  );

  const markUsed = useCallback(
    (id: string) => {
      const c = credits.find((x) => x.id === id);
      if (!c) return;
      const bid = id as Id<"userBenefits">;
      void runPending(id, () =>
        c.used
          ? clearPeriodM({ userBenefitId: bid })
          : logUsageM({ userBenefitId: bid, amount: c.amount - c.usedAmount }),
      );
    },
    [credits, runPending, clearPeriodM, logUsageM],
  );

  const logPartial = useCallback(
    (id: string, amount: number) => {
      if (!(amount > 0)) return;
      void runPending(id, () =>
        logUsageM({ userBenefitId: id as Id<"userBenefits">, amount }),
      );
    },
    [runPending, logUsageM],
  );

  const snooze = useCallback(
    (id: string) => {
      void runPending(id, () =>
        snoozeM({ userBenefitId: id as Id<"userBenefits"> }),
      );
    },
    [runPending, snoozeM],
  );

  const value = useMemo<AppState>(
    () => ({
      credits,
      cards,
      derived,
      isLoading: data === undefined,
      markUsed,
      logPartial,
      snooze,
      pending,
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
      cards,
      derived,
      data,
      markUsed,
      logPartial,
      snooze,
      pending,
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
