"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { DetectedCardsReview } from "@/components/app/DetectedCardsReview";
import {
  usePlaidCardLink,
  type DetectResult,
} from "@/components/app/usePlaidCardLink";
import { StepWallet } from "./StepWallet";

// Step 02 as a Plaid-first gate (design 1a/1b): Connect is the whole step;
// the curated manual picker sits behind the skip link and is the automatic
// fallback on any Plaid failure. After a successful connect the shared review
// screen confirms detected cards, then the wizard continues.
export function StepConnect({
  selected,
  onToggle,
  onPlaidDone,
  onReviewingChange,
}: {
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onPlaidDone: () => void; // advance the wizard to the Spending step
  onReviewingChange?: (reviewing: boolean) => void; // review phase showing — parent hides its footer
}) {
  const configured = useQuery(api.plaid.plaidConfigured);
  const [mode, setMode] = useState<"gate" | "manual">("gate");
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<DetectResult | null>(null);

  // While the review is showing, the wizard footer's "Continue" must not be
  // able to skip past confirm — surface the phase to the parent. The effect
  // cleanup guarantees `reviewing` can never stay stuck true: every way this
  // component leaves the review (onPlaidDone advancing the step, sign-out
  // reset, rail navigation) unmounts it and fires false.
  //
  // Resume gap (accepted): review state is client-only, so closing the tab
  // mid-review resumes onboarding at the gate. The Plaid item already exists
  // server-side and stays manageable via Settings → Connected accounts.
  const reviewing = result !== null;
  useEffect(() => {
    onReviewingChange?.(reviewing);
    return () => onReviewingChange?.(false);
  }, [reviewing, onReviewingChange]);

  const { startConnect, busy } = usePlaidCardLink({
    onDetected: (r) => {
      if (r.accounts.length === 0) {
        setNotice(
          "No credit cards found at that bank — pick your cards manually instead.",
        );
        setMode("manual");
        return;
      }
      setResult(r);
    },
    onFail: (reason, message) => {
      if (reason === "error") {
        // Raw Plaid/backend messages aren't user-appropriate — log them for
        // debugging and show the fixed design copy (state 1c) instead.
        if (message) console.error("Plaid connect failed:", message);
        setNotice("Couldn't connect — pick your cards manually instead.");
        setMode("manual");
      }
      // "exit": user closed Link on purpose — stay on the gate.
    },
  });

  if (result)
    return (
      <DetectedCardsReview
        key={result.itemId}
        result={result}
        onDone={onPlaidDone}
      />
    );

  if (mode === "manual" || configured === false)
    return (
      <div>
        {notice && (
          <p className="mb-4 rounded-[11px] bg-ink px-4 py-3 text-[13.5px] font-medium text-background">
            {notice}
          </p>
        )}
        <StepWallet selected={selected} onToggle={onToggle} />
      </div>
    );

  return (
    <div>
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-tertiary">
        Step 02 · Your wallet
      </div>
      <h1 className="mt-[10px] font-display text-[26px] font-semibold tracking-[-0.02em] lg:text-[32px]">
        Connect your bank
      </h1>
      <p className="mt-[10px] text-[15px] leading-[1.5] text-secondary">
        We&apos;ll find your cards and track their credits automatically.
      </p>

      <div className="mt-8 flex max-w-[400px] flex-col items-center rounded-card-lg border border-border bg-surface px-8 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
            <path d="M14 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" />
          </svg>
        </div>
        <h2 className="mt-4 font-display text-[21px] font-semibold tracking-[-0.01em] text-ink">
          Find my cards for me
        </h2>
        <p className="mt-2 text-[14px] leading-[1.55] text-secondary">
          Connect once — OfferBee detects your credit cards and tracks their
          credits from transactions.
        </p>
        <button
          type="button"
          disabled={busy || configured === undefined}
          onClick={() => void startConnect()}
          className="mt-[22px] w-full rounded-button bg-accent px-5 py-3 text-[14.5px] font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? "Connecting…" : "Connect with Plaid"}
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className="mt-[14px] text-[13.5px] font-medium text-secondary underline underline-offset-2 hover:text-ink"
        >
          I&apos;ll add my cards manually →
        </button>
        <p className="mt-4 font-mono text-[10px] font-medium uppercase tracking-[0.07em] text-tertiary">
          Read-only access · Disconnect anytime
        </p>
      </div>
    </div>
  );
}
