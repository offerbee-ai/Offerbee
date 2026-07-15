"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { DetectedCardsReview } from "@/components/app/DetectedCardsReview";
import { Spinner } from "@/components/app/ui";
import {
  usePlaidCardLink,
  type DetectResult,
} from "@/components/app/usePlaidCardLink";

// "+ Add card" chooser (design 2a): Plaid first, manual always one tap away.
// Plaid failure routes to manual search with a notice — never a dead end.
export default function AddCardChooserPage() {
  const router = useRouter();
  const configured = useQuery(api.plaid.plaidConfigured);
  const [result, setResult] = useState<DetectResult | null>(null);

  const { startConnect, busy } = usePlaidCardLink({
    onDetected: setResult,
    onFail: (reason, message) => {
      if (reason === "error")
        router.push(
          `/app/add/search?notice=${encodeURIComponent(message ?? "Couldn't connect — search for your cards instead.")}`,
        );
      // "exit" (user closed Link) stays on the chooser.
    },
  });

  // Plaid not configured (e.g. missing env in a fresh deployment): manual
  // only. Redirecting from an effect (not during render) keeps this a pure
  // render pass — render still returns null for that one tick.
  useEffect(() => {
    if (configured === false) router.replace("/app/add/search");
  }, [configured, router]);

  if (result)
    return (
      <DetectedCardsReview
        result={result}
        onDone={() => router.push("/app/wallet")}
      />
    );

  // Gate on the config check: rendering the chooser before it resolves would
  // offer a clickable Connect that's doomed if Plaid turns out unconfigured.
  if (configured === undefined)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );

  if (configured === false) return null;

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-[24px] font-semibold tracking-[-0.01em] text-ink">
        Add a card
      </h1>
      <p className="text-[14px] text-secondary">
        Two ways in — both end with every credit tracked.
      </p>

      <button
        type="button"
        onClick={() => void startConnect()}
        disabled={busy}
        className="relative rounded-card border-[1.5px] border-accent bg-surface p-5 text-left ring-[3px] ring-accent-soft transition-opacity disabled:opacity-60"
      >
        <span className="absolute right-4 top-4 rounded-[7px] bg-accent-soft px-2 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-accent">
          Recommended
        </span>
        <span className="block text-[16px] font-semibold text-ink">
          {busy ? "Connecting…" : "Connect your bank"}
        </span>
        <span className="mt-1 block text-[13.5px] text-secondary">
          Auto-detect your cards and track credits from transactions.
        </span>
      </button>

      <Link
        href="/app/add/search"
        className="rounded-card border border-border bg-surface p-5 transition-colors hover:border-tertiary"
      >
        <span className="block text-[16px] font-semibold text-ink">
          Search manually
        </span>
        <span className="mt-1 block text-[13.5px] text-secondary">
          Pick from 65+ cards.
        </span>
      </Link>

      <p className="mt-1 text-center font-mono text-[10px] font-medium uppercase tracking-[0.07em] text-tertiary">
        Read-only access · Disconnect anytime
      </p>
    </div>
  );
}
