import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

import { cardColor, derive, type CardBase, type Credit, type Derived } from "./derive";

// Native analog of the web AppProvider: one listMyCredits subscription feeds
// Review, Benefits, Expiring, and Cards. Same mapping + mutation semantics.

const DAY_MS = 86_400_000;

/** Raw wallet rows from listMyCredits — carries userCardId for mutations. */
export type WalletCard = {
  userCardId: Id<"userCards">;
  cardKey: string;
  name: string;
  issuer: string;
  fee: number;
  imageUrl: string | null;
};

interface CreditsState {
  credits: Credit[];
  cards: CardBase[];
  walletCards: WalletCard[];
  derived: Derived;
  isLoading: boolean;
  now: number;
  markUsed: (id: string) => void; // one-tap: fill remaining, or clear if used
  logPartial: (id: string, amount: number) => void;
  snooze: (id: string) => void;
  untrack: (id: string) => void; // stop tracking this credit (removes it)
  pending: Set<string>; // ids with an in-flight mutation (disable buttons)
}

const Ctx = createContext<CreditsState | null>(null);

export function CreditsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(api.benefits.listMyCredits, isAuthenticated ? {} : "skip");
  const logUsageM = useMutation(api.benefits.logUsage);
  const clearPeriodM = useMutation(api.benefits.clearCurrentPeriod);
  const snoozeM = useMutation(api.benefits.snoozeBenefit);
  const untrackM = useMutation(api.benefits.untrackBenefit);

  const [pending, setPending] = useState<Set<string>>(new Set());

  // Minute clock keeps day-countdowns reactive without server round-trips.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

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

  const runPending = useCallback(async (id: string, fn: () => Promise<unknown>) => {
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
  }, []);

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
      void runPending(id, () => snoozeM({ userBenefitId: id as Id<"userBenefits"> }));
    },
    [runPending, snoozeM],
  );

  const untrack = useCallback(
    (id: string) => {
      void runPending(id, () => untrackM({ userBenefitId: id as Id<"userBenefits"> }));
    },
    [runPending, untrackM],
  );

  const value = useMemo<CreditsState>(
    () => ({
      credits,
      cards,
      walletCards: data?.cards ?? [],
      derived,
      isLoading: isAuthenticated && data === undefined,
      now,
      markUsed,
      logPartial,
      snooze,
      untrack,
      pending,
    }),
    [credits, cards, derived, isAuthenticated, data, now, markUsed, logPartial, snooze, untrack, pending],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCredits(): CreditsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCredits must be used within <CreditsProvider>");
  return ctx;
}
