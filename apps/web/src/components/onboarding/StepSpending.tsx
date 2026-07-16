"use client";

import { ONBOARDING_CATEGORIES } from "@packages/backend/convex/onboardingCatalog";
import { cn } from "@/lib/utils";
import { categoryFeedback } from "./derive";

/** Step 3 — spending categories that rank the credit feed. */
export function StepSpending({
  selected,
  onToggle,
}: {
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="max-w-[560px]">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-tertiary">
        Step 03 · Spending
      </div>
      <h1 className="mt-[10px] font-display text-[26px] font-semibold tracking-[-0.02em] lg:text-[32px]">
        What do you actually spend on?
      </h1>
      <p className="mb-6 mt-[10px] text-[15px] leading-[1.5] text-secondary">
        We&apos;ll float the credits that match your life to the top — so the
        ones you&apos;ll really use come first.
      </p>

      <div className="flex flex-wrap gap-[11px]">
        {ONBOARDING_CATEGORIES.map((c) => {
          const on = selected.has(c.key);
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(c.key)}
              className={cn(
                "whitespace-nowrap rounded-[11px] border px-[15px] py-[9px] text-[14px] font-semibold transition-colors",
                on
                  ? "border-accent bg-accent text-on-accent"
                  : "border-border bg-surface text-ink hover:border-tertiary",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="mt-[26px] inline-flex items-center gap-[9px] rounded-[11px] bg-accent-soft px-4 py-[11px]">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ob-accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
          className="shrink-0"
          aria-hidden="true"
        >
          <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
        </svg>
        <span className="text-[14px] font-semibold text-[#B4550B]">
          {categoryFeedback(selected)}
        </span>
      </div>
    </div>
  );
}
