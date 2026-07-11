"use client";

import type {
  OnboardingCard,
  ReminderPrefs,
} from "@packages/backend/convex/onboardingCatalog";
import { usd } from "@/components/app/data";
import { DaysTile } from "@/components/app/controls";
import { creditsInPlay, deriveReveal, remindersOnCount } from "./derive";

/** Step 5 — the reveal: the dollar value about to slip away. */
export function StepReview({
  cards,
  prefs,
}: {
  cards: OnboardingCard[];
  prefs: ReminderPrefs;
}) {
  const reveal = deriveReveal(cards);

  return (
    <div className="max-w-[560px]">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-accent">
        You&apos;re all set
      </div>
      <h1 className="mt-3 font-display text-[30px] font-semibold leading-[1.04] tracking-[-0.02em] lg:text-[38px]">
        {reveal.totalStr} is about to slip away.
      </h1>
      <p className="mb-[22px] mt-[14px] text-[15px] leading-[1.5] text-secondary">
        {reveal.countStr} reset within a week across your wallet. This is what
        OfferBee will surface the moment you sign in.
      </p>

      <div className="rounded-[18px] border border-border bg-surface px-[22px] pb-[14px] pt-2 shadow-ob-sm">
        {reveal.items.map((it) => (
          <div
            key={`${it.card}-${it.name}`}
            className="flex items-center gap-[14px] border-t border-separator py-[14px] first:border-t-0"
          >
            <DaysTile days={it.days} size={46} urgent={it.urgent} />
            <span
              className="block h-[23px] w-[34px] shrink-0 rounded-[5px]"
              style={{ background: it.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">{it.name}</div>
              <div className="text-[12.5px] text-secondary">{it.card}</div>
            </div>
            <div className="tabular font-mono text-[15px] font-semibold text-accent">
              {usd(it.amt)}
            </div>
          </div>
        ))}
        {reveal.items.length === 0 && (
          <div className="py-4 text-[13.5px] text-tertiary">
            Add a card or two and we&apos;ll show what&apos;s about to reset.
          </div>
        )}
      </div>

      <div className="mt-[22px] flex items-center gap-5 rounded-[14px] border border-border bg-surface-2 px-6 py-4 lg:gap-[26px]">
        <div>
          <div className="tabular font-mono text-[16px] font-semibold lg:text-[20px]">
            {cards.length}
          </div>
          <div className="text-[12px] text-secondary">
            {cards.length === 1 ? "card added" : "cards added"}
          </div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <div className="tabular font-mono text-[16px] font-semibold text-accent lg:text-[20px]">
            {usd(creditsInPlay(cards))}
          </div>
          <div className="text-[12px] text-secondary">tracked per year</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <div className="tabular font-mono text-[16px] font-semibold lg:text-[20px]">
            {remindersOnCount(prefs)} of 4
          </div>
          <div className="text-[12px] text-secondary">reminders on</div>
        </div>
      </div>
    </div>
  );
}
