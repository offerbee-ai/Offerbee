"use client";

import { LogPartialButton } from "./controls";
import { usd, type PeriodCell } from "./data";
import { cn } from "@/lib/utils";

/**
 * Per-period grid for a credit (this calendar year). Annual → a single checkbox
 * cell; quarterly/semiannual → one labeled cell per period. Only the current
 * period is interactive (tap = mark used / clear, ＋$ = log a partial amount);
 * past cells are read-only (used ✓ / missed) and future cells are dimmed.
 * Monthly credits don't use this (they keep the single current-period control).
 */

type CellState = "used" | "partial" | "current" | "missed" | "upcoming";

function cellState(p: PeriodCell): CellState {
  if (p.used) return "used";
  if (p.usedAmount > 0) return "partial";
  if (p.status === "current") return "current";
  if (p.status === "elapsed") return "missed";
  return "upcoming";
}

const STATE_CLASS: Record<CellState, string> = {
  used: "bg-accent text-on-accent border-accent",
  partial: "bg-accent-soft text-accent border-accent-soft",
  current: "border-accent border-dashed text-accent hover:bg-accent-soft",
  missed: "bg-track text-tertiary border-border opacity-70",
  upcoming: "bg-track text-tertiary border-border opacity-40",
};

function glyph(state: CellState, usedAmount: number, full: boolean): string {
  switch (state) {
    case "used":
      return "✓";
    case "partial":
      return full ? usd(usedAmount) : "◐";
    case "current":
      return "＋";
    case "missed":
      return "–";
    case "upcoming":
      return "·";
  }
}

export function PeriodGrid({
  periods,
  amount,
  onMarkCurrent,
  onLogPartial,
  pending,
  size = "compact",
}: {
  periods: PeriodCell[];
  amount: number;
  onMarkCurrent: () => void;
  onLogPartial: (amount: number) => void;
  pending?: boolean;
  size?: "compact" | "full";
}) {
  if (!periods.length) return null;

  const full = size === "full";
  const single = periods.length === 1; // annual → checkbox
  const current = periods.find((p) => p.status === "current");
  const showPartial = !!current && !current.used;

  const box = cn(
    "flex flex-col items-center justify-center rounded-[9px] border font-semibold tabular",
    full ? "h-11 gap-0.5 px-2 text-[13px]" : "h-8 px-1 text-[12px]",
    single ? (full ? "min-w-[96px]" : "min-w-[72px]") : full ? "min-w-[56px]" : "min-w-[38px]",
  );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center",
        full ? "gap-2" : "justify-end gap-1.5",
      )}
    >
      {periods.map((p) => {
        const state = cellState(p);
        // Annual's server label is the year; show the dollar amount instead so
        // the single cell reads as a checkbox for the credit.
        const label = single ? usd(amount) : p.label;
        const content = (
          <>
            <span className="leading-none">{glyph(state, p.usedAmount, full)}</span>
            <span
              className={cn(
                "leading-none",
                full ? "text-[10px] font-medium" : "text-[8.5px] font-medium",
                single && "text-[11px]",
              )}
            >
              {label}
            </span>
          </>
        );

        // Only the current period is interactive — regardless of whether it's
        // empty, partially, or fully used (tap fills the remainder, or clears
        // if already full). Past/future cells are read-only.
        if (p.status === "current")
          return (
            <button
              key={p.key}
              type="button"
              onClick={onMarkCurrent}
              disabled={pending}
              aria-label={p.used ? `Clear ${p.label}` : `Mark ${p.label} used`}
              className={cn(box, STATE_CLASS[state], "transition-colors disabled:opacity-50")}
            >
              {content}
            </button>
          );

        return (
          <div key={p.key} className={cn(box, STATE_CLASS[state])} aria-label={`${p.label}: ${state}`}>
            {content}
          </div>
        );
      })}

      {showPartial && (
        <LogPartialButton onLog={onLogPartial} disabled={pending} />
      )}
    </div>
  );
}
