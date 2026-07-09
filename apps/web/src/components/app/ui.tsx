import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong",
  secondary: "border border-border bg-surface text-ink hover:border-accent",
  ghost: "text-body hover:text-accent",
  danger: "border border-border bg-surface text-alert hover:border-alert",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-button px-4 py-2 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-surface p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-tertiary">
      {children}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warning";
}) {
  const tones = {
    neutral: "bg-field text-secondary",
    accent: "bg-accent-soft text-accent",
    warning: "bg-warning-soft text-warning",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-badge px-2 py-0.5 text-[12px] font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div
      className="size-5 animate-spin rounded-full border-2 border-track border-t-accent"
      role="status"
      aria-label="Loading"
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface px-6 py-16 text-center">
      <p className="font-display text-[20px] font-semibold text-ink">{title}</p>
      {description && (
        <p className="mt-2 max-w-[36ch] text-[15px] text-body">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Figure({ children }: { children: ReactNode }) {
  return <span className="tabular font-mono text-ink">{children}</span>;
}
