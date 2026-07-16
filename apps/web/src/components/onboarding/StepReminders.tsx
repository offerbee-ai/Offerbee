"use client";

import type {
  OnboardingCard,
  NotificationCategories,
} from "@packages/backend/convex/onboardingCatalog";
import { BeeLogo } from "@/components/landing/BrandMark";
import { ToggleSwitch } from "@/components/app/controls";
import { deriveNotifPreview } from "./derive";

const TOGGLES: { key: keyof NotificationCategories; label: string; desc: string }[] = [
  { key: "expiry", label: "Expiry alerts", desc: "A nudge before each credit resets" },
  { key: "digest", label: "Weekly digest", desc: "Monday summary of what's available" },
  { key: "renewal", label: "Renewal alerts", desc: "Annual fees and signup deadlines" },
  { key: "transactions", label: "Detected credits", desc: "When we spot a credit you can confirm" },
];

/** Step 4 — notification preferences with a live sample nudge. */
export function StepReminders({
  cards,
  prefs,
  onToggle,
}: {
  cards: OnboardingCard[];
  prefs: NotificationCategories;
  onToggle: (key: keyof NotificationCategories, value: boolean) => void;
}) {
  const preview = deriveNotifPreview(cards);

  return (
    <div className="max-w-[540px]">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-tertiary">
        Step 04 · Reminders
      </div>
      <h1 className="mt-[10px] font-display text-[26px] font-semibold tracking-[-0.02em] lg:text-[32px]">
        Never miss a reset.
      </h1>
      <p className="mb-[22px] mt-[10px] text-[15px] leading-[1.5] text-secondary">
        We nudge you at the right moment — right before a credit resets, and
        never more than that.
      </p>

      <div className="mb-5">
        <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-tertiary">
          What a nudge looks like
        </div>
        <div
          className="flex items-start gap-3 rounded-[16px] border border-border bg-surface px-4 py-[14px] shadow-[0_10px_26px_rgba(33,29,22,.09)] transition-opacity duration-250"
          style={{ opacity: prefs.expiry ? 1 : 0.35 }}
        >
          <BeeLogo size={32} gid="onb-notif" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] font-semibold tracking-[0.05em] text-tertiary">
                OFFERBEE
              </span>
              <span className="text-[11px] text-tertiary">now</span>
            </div>
            <div className="mt-[2px] text-[14px] font-semibold">
              {preview.head}
            </div>
            <div className="text-[12.5px] text-secondary">{preview.body}</div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
        {TOGGLES.map((t) => (
          <div
            key={t.key}
            className="flex items-center gap-[14px] border-t border-separator px-5 py-4 first:border-t-0"
          >
            <div className="flex-1">
              <div className="text-[15px] font-semibold">{t.label}</div>
              <div className="text-[12.5px] text-secondary">{t.desc}</div>
            </div>
            <ToggleSwitch
              checked={prefs[t.key]}
              onChange={(v) => onToggle(t.key, v)}
              label={t.label}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
