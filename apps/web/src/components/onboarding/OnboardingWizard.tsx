"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import {
  DEFAULT_NOTIFICATION_CATEGORIES,
  type NotificationCategories,
} from "@packages/backend/convex/onboardingCatalog";
import { usd } from "@/components/app/data";
import { cn } from "@/lib/utils";
import { BeeLogo } from "@/components/landing/BrandMark";
import { Spinner } from "@/components/app/ui";
import { creditsInPlay, selectedCards } from "./derive";
import { StepAccount } from "./StepAccount";
import { StepConnect } from "./StepConnect";
import { StepSpending } from "./StepSpending";
import { StepReminders } from "./StepReminders";
import { StepReview } from "./StepReview";

const STEPS = ["Account", "Wallet", "Spending", "Reminders", "Review"];
const PERSIST_DEBOUNCE_MS = 500;

/**
 * First-run onboarding wizard (design_handoff_onboarding, web option 1a).
 *
 * Progress is persisted (debounced) to the user's Convex row, so refreshing,
 * closing the tab, or switching devices resumes exactly where the user left
 * off. OnboardingGate routes unfinished users back here from /app; a
 * completed user landing here is bounced to /app.
 */
export function OnboardingWizard() {
  const router = useRouter();
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.getMe, isAuthenticated ? {} : "skip");

  const ensureUser = useMutation(api.users.ensureUser);
  const updateOnboarding = useMutation(api.onboarding.updateOnboarding);
  const completeOnboarding = useMutation(api.onboarding.completeOnboarding);

  const [step, setStep] = useState(0);
  const [cards, setCards] = useState<ReadonlySet<string>>(new Set());
  const [cats, setCats] = useState<ReadonlySet<string>>(new Set());
  const [prefs, setPrefs] = useState<NotificationCategories>(DEFAULT_NOTIFICATION_CATEGORIES);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrated = useRef(false);
  const ensured = useRef(false);
  const lastPersisted = useRef<string | null>(null);

  const completed = Boolean(me?.onboardingCompletedAt);
  // Once signed in, the account step is done — never show it (mounting Clerk's
  // <SignUp/> while signed in makes it redirect away).
  const viewStep = isSignedIn ? Math.max(step, 1) : 0;

  // A finished user has no business here — straight to the app.
  useEffect(() => {
    if (completed) router.replace("/app");
  }, [completed, router]);

  // Register the user with the shared backend (same pattern as AppShell).
  useEffect(() => {
    if (!isAuthenticated || !user || ensured.current) return;
    ensured.current = true;
    ensureUser({
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName ?? undefined,
    }).catch((e) => console.error("ensureUser failed", e));
  }, [isAuthenticated, user, ensureUser]);

  // Hydrate local state from the server once per session — this is the resume.
  useEffect(() => {
    if (hydrated.current || !isAuthenticated || me === undefined || completed)
      return;
    hydrated.current = true;
    if (me) {
      if (me.onboardingCards) setCards(new Set(me.onboardingCards));
      if (me.spendingCategories) setCats(new Set(me.spendingCategories));
      if (me.notificationCategories) setPrefs(me.notificationCategories);
    }
    setStep(Math.min(4, Math.max(1, me?.onboardingStep ?? 1)));
  }, [isAuthenticated, me, completed]);

  // Signed out (or switched accounts) mid-wizard: back to square one and stop
  // persisting until a session exists again.
  useEffect(() => {
    if (!clerkLoaded || isSignedIn) return;
    hydrated.current = false;
    ensured.current = false;
    lastPersisted.current = null;
    setStep(0);
    setCards(new Set());
    setCats(new Set());
    setPrefs(DEFAULT_NOTIFICATION_CATEGORIES);
  }, [clerkLoaded, isSignedIn]);

  const payload = useMemo(
    () => ({
      step: Math.max(1, step),
      cards: [...cards],
      categories: [...cats],
      notificationCategories: prefs,
    }),
    [step, cards, cats, prefs],
  );

  const canPersist =
    hydrated.current && isAuthenticated && !completed && !completing;

  const persistNow = useCallback(() => {
    const json = JSON.stringify(payload);
    if (json === lastPersisted.current) return;
    lastPersisted.current = json;
    updateOnboarding(payload).catch((e) => {
      console.error("updateOnboarding failed", e);
      // Forget the failed send so the same state is retried on the next
      // change/flush instead of being considered saved.
      if (lastPersisted.current === json) lastPersisted.current = null;
    });
  }, [payload, updateOnboarding]);
  const persistRef = useRef({ persistNow, canPersist });
  persistRef.current = { persistNow, canPersist };

  // Debounced auto-save of every change.
  useEffect(() => {
    if (!canPersist) return;
    if (JSON.stringify(payload) === lastPersisted.current) return;
    const t = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [payload, canPersist, persistNow]);

  // Flush a pending save when the tab is hidden/closed.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      const { persistNow, canPersist } = persistRef.current;
      if (canPersist) persistNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const toggleCard = useCallback((id: string) => {
    setCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleCat = useCallback((key: string) => {
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setPref = useCallback((key: keyof NotificationCategories, value: boolean) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const goTo = useCallback(
    (target: number) => {
      // Step 0 belongs to Clerk; it's unreachable once the account exists.
      if (!isSignedIn || target < 1) return;
      setStep(Math.min(4, target));
      setError(null);
    },
    [isSignedIn],
  );

  const finish = useCallback(async () => {
    if (completing) return;
    setCompleting(true);
    setError(null);
    try {
      await completeOnboarding({
        cards: [...cards],
        categories: [...cats],
        notificationCategories: prefs,
      });
      router.replace("/app");
    } catch (e) {
      console.error("completeOnboarding failed", e);
      setError("Something went wrong finishing your setup — please try again.");
      setCompleting(false);
    }
  }, [completing, completeOnboarding, cards, cats, prefs, router]);

  // ── Render ────────────────────────────────────────────────────────────────

  // Wait for Clerk; once signed in, also wait for the Convex token + profile
  // (and let the completed-redirect fire) before showing anything.
  const booting =
    !clerkLoaded || (isSignedIn && (!isAuthenticated || me === undefined));
  if (booting || completed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner />
      </div>
    );
  }

  const selected = selectedCards(cards);
  const counterValue = usd(creditsInPlay(selected));
  const counterCaption = `${selected.length} ${selected.length === 1 ? "card added" : "cards added"} · adds up as you go`;

  return (
    <div className="flex h-dvh bg-background text-ink">
      {/* Left rail (desktop) */}
      <aside className="hidden w-[296px] shrink-0 flex-col border-r border-border bg-surface px-[18px] pb-[18px] pt-[26px] lg:flex">
        <div className="flex items-center gap-[11px] px-2 pb-[22px]">
          <BeeLogo size={30} gid="onb-rail" />
          <span className="font-display text-[20px] font-semibold tracking-[-0.01em]">
            OfferBee
          </span>
        </div>

        <nav className="flex flex-col gap-[2px]" aria-label="Setup steps">
          {STEPS.map((label, i) => (
            <StepRow
              key={label}
              index={i}
              label={label}
              state={i < viewStep ? "done" : i === viewStep ? "current" : "todo"}
              disabled={!isSignedIn || i === 0}
              onClick={() => goTo(i)}
            />
          ))}
        </nav>

        <div className="mt-auto rounded-[16px] border border-border bg-surface-2 p-4">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-tertiary">
            Credits in play
          </div>
          <div className="tabular mt-1 font-mono text-[28px] font-semibold tracking-[-0.02em] text-accent">
            {counterValue}
          </div>
          <div className="mt-px text-[12.5px] text-secondary">
            {counterCaption}
          </div>
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact header + stepper (below lg) */}
        <header className="border-b border-separator px-5 pb-3 pt-4 lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BeeLogo size={24} gid="onb-head" />
              <span className="font-display text-[17px] font-semibold">
                OfferBee
              </span>
            </div>
            <span className="font-mono text-[11px] text-tertiary">
              Step {viewStep + 1} of 5
            </span>
          </div>
          <div className="mt-3 flex">
            {STEPS.map((label, i) => {
              const state =
                i < viewStep ? "done" : i === viewStep ? "current" : "todo";
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!isSignedIn || i === 0}
                  onClick={() => goTo(i)}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <StepCircle index={i} state={state} size={24} />
                  <span
                    className={cn(
                      "text-[9.5px] font-semibold",
                      state === "todo" ? "text-tertiary" : "text-ink",
                    )}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-5 lg:px-[54px] lg:py-[44px]">
          <div key={viewStep} className="min-h-full animate-obfade">
            {viewStep === 0 && <StepAccount />}
            {viewStep === 1 && (
              <StepConnect
                selected={cards}
                onToggle={toggleCard}
                onPlaidDone={() => goTo(2)}
              />
            )}
            {viewStep === 2 && (
              <StepSpending selected={cats} onToggle={toggleCat} />
            )}
            {viewStep === 3 && (
              <StepReminders cards={selected} prefs={prefs} onToggle={setPref} />
            )}
            {viewStep === 4 && <StepReview cards={selected} prefs={prefs} />}
          </div>
        </main>

        {/* Footer bar — hidden on the Clerk step (Clerk owns that CTA). */}
        {viewStep > 0 && (
          <footer className="flex items-center justify-between gap-3 border-t border-border bg-surface px-5 py-4 lg:px-[54px]">
            <div className="lg:hidden">
              <div className="tabular font-mono text-[15px] font-semibold text-accent">
                {counterValue}
              </div>
              <div className="text-[10px] text-secondary">credits in play</div>
            </div>
            <div className="hidden font-mono text-[12px] text-tertiary lg:block">
              Step {viewStep + 1} of 5
            </div>
            <div className="flex items-center gap-3">
              {error && (
                <span className="text-[12.5px] font-semibold text-alert">
                  {error}
                </span>
              )}
              {viewStep > 1 && viewStep < 4 && (
                <button
                  type="button"
                  onClick={() => goTo(viewStep - 1)}
                  className="rounded-[11px] border border-border bg-surface px-[18px] py-[11px] text-[14px] font-semibold text-secondary transition-colors hover:text-ink"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                disabled={completing}
                onClick={() =>
                  viewStep === 4 ? void finish() : goTo(viewStep + 1)
                }
                className="rounded-[11px] bg-accent px-[22px] py-[11px] text-[14px] font-semibold text-on-accent shadow-[0_6px_16px_rgba(232,104,14,.22)] transition-colors hover:bg-accent-strong disabled:opacity-60"
              >
                {viewStep === 4
                  ? completing
                    ? "Setting up…"
                    : "Enter OfferBee →"
                  : "Continue"}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

// ── Step indicator pieces ─────────────────────────────────────────────────────

type StepState = "done" | "current" | "todo";

function StepCircle({
  index,
  state,
  size = 28,
}: {
  index: number;
  state: StepState;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold",
        state === "todo"
          ? "border-[1.5px] border-border text-tertiary"
          : "bg-accent text-on-accent",
      )}
      style={{ width: size, height: size }}
    >
      {state === "done" ? (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        String(index + 1).padStart(2, "0")
      )}
    </span>
  );
}

function StepRow({
  index,
  label,
  state,
  disabled,
  onClick,
}: {
  index: number;
  label: string;
  state: StepState;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-current={state === "current" ? "step" : undefined}
      className={cn(
        "flex items-center gap-[13px] rounded-[11px] p-[10px] text-left transition-colors",
        state === "current" && "bg-accent-soft",
        !disabled && state !== "current" && "hover:bg-surface-2",
        disabled && "cursor-default",
      )}
    >
      <StepCircle index={index} state={state} />
      <span
        className={cn(
          "text-[14.5px] font-semibold",
          state === "todo" ? "text-tertiary" : "text-ink",
        )}
      >
        {label}
      </span>
    </button>
  );
}
