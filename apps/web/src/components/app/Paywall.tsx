"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useClerk, useUser } from "@clerk/nextjs";
import { BeeLogo } from "@/components/landing/BrandMark";

// Mirrors the backend's checkout trial_end cutoff: further out than this,
// Stripe bills at trial end (paywall shows the no-charge line); closer in,
// checkout charges immediately and the line is dropped.
const TRIAL_END_CUTOFF_MS = 48 * 60 * 60 * 1000;

const FEATURES = [
  "Automatic credit detection & reset reminders",
  "Fee-vs-value verdict at each renewal",
  "Unlimited cards & year-by-year history",
];

const fmtMoney = (n: number) =>
  `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="mt-[2px] shrink-0 text-accent"
      aria-hidden
    >
      <path
        d="M3 8.5 6.5 12 13 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// "Your trial so far" statement panel. Fixed dark palette in both themes
// (design rule: it's a ledger of real numbers, not a theme-mapped surface).
function TrialLedger({
  items,
  total,
}: {
  items: Array<{ title: string; cardName: string; count: number; amount: number }>;
  total: number;
}) {
  return (
    <div className="flex flex-col rounded-[16px] bg-[#211D16] p-7 text-[#F4F0E6]">
      <div className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#F59E3C]">
        Your trial so far
      </div>
      <ul className="mt-4">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-baseline justify-between gap-4 border-b border-[#F4F0E6]/15 py-3 text-[14px]"
          >
            <span className="min-w-0 truncate">
              {it.title} · {it.cardName}
              {it.count > 1 ? ` × ${it.count}` : ""}
            </span>
            <span className="shrink-0 font-mono">{fmtMoney(it.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-4 pt-4">
        <span className="text-[15px] font-semibold">
          Captured during your trial
        </span>
        <span className="font-mono text-[24px] font-semibold text-[#F59E3C]">
          {fmtMoney(total)}
        </span>
      </div>
      <p className="mt-auto pt-8 text-[13px] text-[#F4F0E6]/85">
        A year of Pro costs <span className="text-[#F59E3C]">$80</span> —{" "}
        {total > 80
          ? "less than what OfferBee found in your trial."
          : "it pays for itself."}
      </p>
    </div>
  );
}

// Full-screen paywall styled per Design/design_handoff_paywall (screen 2a).
// Stripe Checkout hosts all payment UI.
// `onDismiss` present ⇒ opened voluntarily from the trial banner (dismissable);
// absent ⇒ hard paywall (only exit is Sign out).
export function Paywall({
  trialEndsAt,
  status,
  onDismiss,
}: {
  trialEndsAt: number | null;
  status: string;
  onDismiss?: () => void;
}) {
  const createCheckout = useAction(api.billing.createCheckoutSession);
  const ledger = useQuery(api.billing.getTrialLedger);
  const { signOut } = useClerk();
  const { user } = useUser();
  const [busy, setBusy] = useState<"monthly" | "yearly" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Snapshot at mount — this screen is short-lived, so the countdown doesn't
  // need to tick (and reading Date.now() in render trips react-hooks/purity).
  const [now] = useState(() => Date.now());

  const trialDaysLeft =
    trialEndsAt !== null
      ? Math.max(0, Math.ceil((trialEndsAt - now) / 86_400_000))
      : null;
  const billedAtTrialEnd =
    trialEndsAt !== null && trialEndsAt - now > TRIAL_END_CUTOFF_MS;
  const showLedger = !!ledger && ledger.total > 0 && ledger.items.length > 0;
  // While the ledger query is in flight, hold its grid slot with a skeleton so
  // the plan column doesn't reflow when it resolves.
  const ledgerPending = ledger === undefined;
  const signedInAs =
    user?.firstName ??
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ??
    null;

  const buy = async (plan: "monthly" | "yearly") => {
    setBusy(plan);
    setError(null);
    try {
      const { url } = await createCheckout({ plan, platform: "web" });
      window.location.assign(url); // full nav to Stripe-hosted checkout
    } catch {
      setError("Couldn't start checkout. Please try again.");
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-ink">
      {/* Signed-in top bar */}
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
        <div className="flex items-center gap-2.5">
          <BeeLogo size={28} gid="paywall" />
          <span className="font-display text-[19px] font-semibold tracking-[-0.01em]">
            OfferBee
          </span>
        </div>
        <div className="text-[13px] text-secondary">
          {signedInAs && <span>Signed in as {signedInAs} · </span>}
          <button
            onClick={() => (onDismiss ? onDismiss() : signOut())}
            disabled={busy !== null}
            className="font-semibold text-accent underline-offset-2 hover:underline disabled:opacity-60"
          >
            {onDismiss ? "Back to app" : "Sign out"}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col items-center px-6 py-14">
        <div className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
          OfferBee Pro
        </div>
        <h1 className="mt-3 text-center font-display text-[34px] font-semibold tracking-[-0.01em] sm:text-[38px]">
          {trialDaysLeft && trialDaysLeft > 0
            ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your trial`
            : status === "trialing"
              ? "Your trial has ended"
              : "Your subscription has ended"}
        </h1>
        <p className="mt-3 max-w-[34em] text-center text-[16px] leading-relaxed text-secondary">
          Keep every statement credit working for you — reminders before
          resets, fee-vs-value verdicts, automatic credit detection.
        </p>

        <div
          className={
            showLedger || ledgerPending
              ? "mt-10 grid w-full items-stretch gap-6 lg:grid-cols-[1fr_1.15fr]"
              : "mt-10 w-full max-w-[560px]"
          }
        >
          {ledgerPending && (
            <div className="flex animate-pulse flex-col gap-4 rounded-[16px] bg-[#211D16] p-7">
              <div className="h-3 w-28 rounded-md bg-[#F4F0E6]/15" />
              <div className="h-3 w-48 rounded-md bg-[#F4F0E6]/15" />
              <div className="h-3 w-40 rounded-md bg-[#F4F0E6]/15" />
              <div className="h-3 w-52 rounded-md bg-[#F4F0E6]/15" />
            </div>
          )}
          {showLedger && <TrialLedger items={ledger.items} total={ledger.total} />}

          <div className="flex flex-col gap-4">
            {/* Yearly — featured */}
            <div className="relative rounded-[16px] border-2 border-accent bg-surface p-6">
              <span className="absolute -top-3 right-5 rounded-full bg-accent px-3 py-1 font-mono text-[11px] font-semibold text-on-accent">
                Best value
              </span>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[15px] font-medium">Yearly</div>
                  <div className="mt-1 font-mono text-[30px] font-semibold">
                    $80
                    <span className="ml-1 font-sans text-[14px] font-normal text-secondary">
                      /year
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
                      save 33%
                    </span>
                    <span className="text-[13px] text-secondary">$6.67/mo</span>
                  </div>
                </div>
                <button
                  onClick={() => buy("yearly")}
                  disabled={busy !== null}
                  className="rounded-[10px] bg-accent px-5 py-2.5 text-[15px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy === "yearly" ? "Redirecting…" : "Subscribe yearly"}
                </button>
              </div>
            </div>

            {/* Monthly — quiet alternative */}
            <div className="rounded-[16px] border border-border bg-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[15px] font-medium">Monthly</div>
                  <div className="mt-1 font-mono text-[30px] font-semibold">
                    $9.99
                    <span className="ml-1 font-sans text-[14px] font-normal text-secondary">
                      /month
                    </span>
                  </div>
                  <div className="mt-1.5 text-[13px] text-secondary">
                    Cancel anytime
                  </div>
                </div>
                <button
                  onClick={() => buy("monthly")}
                  disabled={busy !== null}
                  className="rounded-[10px] bg-surface-2 px-5 py-2.5 text-[15px] font-semibold text-ink transition-colors hover:bg-border disabled:opacity-60"
                >
                  {busy === "monthly" ? "Redirecting…" : "Subscribe monthly"}
                </button>
              </div>
            </div>

            {/* Feature checklist */}
            <div className="rounded-[16px] border border-border bg-surface p-6">
              <ul className="flex flex-col gap-3">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px] text-body">
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {error && <p className="mt-5 text-[14px] text-alert">{error}</p>}

        <p className="mt-9 text-center text-[12px] text-tertiary">
          {billedAtTrialEnd && "You won't be charged until your trial ends · "}
          Prices in USD ·{" "}
          <a
            href="https://offerbee.ai/terms"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            Terms
          </a>
        </p>
      </main>
    </div>
  );
}
