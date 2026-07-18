"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Reusable primitives shared across the six authenticated views, matching the
 * design_handoff_webapp specs (segmented control, toggle switch, mark-used
 * button, days tile, brand chip, progress bar, stat tile).
 */

// ── Segmented control ───────────────────────────────────────────────────────
export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-[10px] border border-border bg-segmented-track p-[3px]",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "whitespace-nowrap rounded-[8px] px-[14px] py-[7px] text-[13px] font-semibold transition-colors",
              on
                ? "bg-surface text-ink shadow-ob-sm"
                : "text-secondary hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Toggle switch ───────────────────────────────────────────────────────────
export function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-[26px] w-[44px] shrink-0 items-center rounded-[14px] p-[3px] transition-colors duration-200",
        checked ? "justify-end bg-accent" : "justify-start bg-track",
      )}
    >
      <span className="size-[20px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)]" />
    </button>
  );
}

// ── Mark used / Used ✓ button ───────────────────────────────────────────────
export function MarkUsedButton({
  used,
  onClick,
}: {
  used: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-[9px] text-[12.5px] font-semibold transition-colors",
        used
          ? "bg-accent-soft px-3 py-[7px] text-accent"
          : "bg-accent px-[13px] py-[7px] text-on-accent hover:bg-accent-strong",
      )}
    >
      {used ? "Used ✓" : "Mark used"}
    </button>
  );
}

// ── Log-partial button (compact "＋$" → inline amount entry) ────────────────
export function LogPartialButton({
  onLog,
  disabled,
}: {
  onLog: (amount: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");

  if (!open)
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label="Log a partial amount"
        className="whitespace-nowrap rounded-[9px] border border-border px-[10px] py-[7px] text-[12.5px] font-semibold text-secondary transition-colors hover:text-ink disabled:opacity-50"
      >
        ＋<span className="hidden md:inline">$</span>
      </button>
    );

  const submit = () => {
    const n = parseFloat(val);
    if (Number.isFinite(n) && n > 0) onLog(n);
    setOpen(false);
    setVal("");
  };
  const cancel = () => {
    setOpen(false);
    setVal("");
  };

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") cancel();
        }}
        placeholder="$"
        className="w-[64px] rounded-[8px] border border-border bg-surface px-2 py-[6px] text-[13px] text-ink outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        aria-label="Confirm amount"
        className="rounded-[8px] bg-accent px-[9px] py-[6px] text-[12.5px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
      >
        ✓
      </button>
      <button
        type="button"
        onClick={cancel}
        aria-label="Cancel"
        className="rounded-[8px] border border-border px-[9px] py-[6px] text-[12.5px] font-semibold text-secondary hover:text-ink"
      >
        ✕
      </button>
    </span>
  );
}

// ── "Days" tile ─────────────────────────────────────────────────────────────
export function DaysTile({
  days,
  size = 46,
  urgent,
}: {
  days: number;
  size?: number;
  urgent: boolean;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-[12px]",
        urgent ? "bg-warning-soft text-warning" : "bg-track text-secondary",
      )}
      style={{ width: size, height: size }}
    >
      <span className="tabular font-mono text-[15px] font-semibold leading-none">
        {days}
      </span>
      <span className="mt-[2px] text-[8.5px] font-medium uppercase tracking-[0.04em] opacity-80">
        days
      </span>
    </div>
  );
}

// ── Card-brand color chip (brand colors are theme-independent) ──────────────
export function BrandChip({
  color,
  width = 32,
  height = 22,
}: {
  color: string;
  width?: number;
  height?: number;
}) {
  return (
    <span
      className="block shrink-0 rounded-[6px]"
      style={{
        width,
        height,
        background: color,
        backgroundImage:
          "linear-gradient(140deg, rgba(255,255,255,.18), rgba(0,0,0,.15))",
      }}
    />
  );
}

// ── Progress bar ────────────────────────────────────────────────────────────
export function ProgressBar({
  pct,
  color = "var(--ob-accent)",
  height = 10,
}: {
  pct: number;
  color?: string;
  height?: number;
}) {
  return (
    <div
      className="w-full overflow-hidden rounded-[6px] bg-track"
      style={{ height }}
    >
      <div
        className="h-full rounded-[6px] transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
      />
    </div>
  );
}

// ── Stat tile (icon chip + mono figure + caption) ──────────────────────────
export function StatTile({
  icon,
  figure,
  caption,
  figureColor,
  iconTone = "accent",
}: {
  icon: ReactNode;
  figure: ReactNode;
  caption: string;
  figureColor?: string;
  iconTone?: "accent" | "warning";
}) {
  return (
    <div className="rounded-[18px] border border-border bg-surface p-[18px] shadow-ob-sm">
      <div
        className={cn(
          "flex size-[34px] items-center justify-center rounded-[10px]",
          iconTone === "accent"
            ? "bg-accent-soft text-accent"
            : "bg-warning-soft text-warning",
        )}
      >
        {icon}
      </div>
      <div
        className="tabular mt-3 font-mono text-[24px] font-semibold tracking-[-0.02em]"
        style={figureColor ? { color: figureColor } : undefined}
      >
        {figure}
      </div>
      <div className="mt-1 text-[12.5px] text-secondary">{caption}</div>
    </div>
  );
}

// ── Card (surface panel) ────────────────────────────────────────────────────
export function Panel({
  className,
  children,
  style,
}: {
  className?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-border bg-surface shadow-ob",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export function MonoLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-tertiary",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Circle-check claim toggle (28px inside a 44px hit zone) ──────────────────
export function CircleCheck({
  claimed,
  onClick,
  disabled,
}: {
  claimed: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={claimed}
      aria-label={claimed ? "Claimed — tap to undo" : "Mark claimed"}
      className="group flex size-11 shrink-0 items-center justify-center disabled:opacity-50"
    >
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full border-2 transition-colors",
          claimed
            ? "border-transparent bg-accent text-on-accent group-hover:bg-accent-strong"
            : "border-[#D8CFBC] bg-surface text-transparent group-hover:border-accent",
        )}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
      </span>
    </button>
  );
}

// ── Row overflow: partial-log + snooze, revealed on demand (web). ───────────
export function RowOverflow({
  onLogPartial,
  onSnooze,
  disabled,
}: {
  onLogPartial: (amount: number) => void;
  onSnooze: () => void;
  disabled?: boolean;
}) {
  const [val, setVal] = useState("");
  const submit = () => {
    if (disabled) return;
    const n = parseFloat(val);
    if (Number.isFinite(n) && n > 0) {
      onLogPartial(n);
      setVal("");
    }
  };
  return (
    <details className="relative">
      <summary
        aria-label="More actions"
        className="flex size-8 cursor-pointer list-none items-center justify-center rounded-[8px] border border-border text-secondary transition-colors hover:bg-track hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </summary>
      <div className="absolute right-0 z-10 mt-1 flex w-[190px] flex-col gap-2 rounded-[12px] border border-border bg-surface p-3 shadow-ob">
        <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-tertiary">
          Log partial
        </label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="$"
            disabled={disabled}
            className="w-full rounded-[8px] border border-border bg-surface px-2 py-[6px] text-[13px] text-ink outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={submit}
            disabled={disabled}
            className="rounded-[8px] bg-accent px-[9px] py-[6px] text-[12.5px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
          >
            ✓
          </button>
        </div>
        <button
          type="button"
          onClick={onSnooze}
          disabled={disabled}
          className="rounded-[8px] border border-border px-3 py-[7px] text-[12.5px] font-semibold text-secondary hover:text-ink disabled:opacity-50"
        >
          Snooze
        </button>
      </div>
    </details>
  );
}
