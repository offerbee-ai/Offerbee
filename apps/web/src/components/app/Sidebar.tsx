"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { cn, clerkImageUrl } from "@/lib/utils";
import { BeeLogo } from "@/components/landing/BrandMark";
import {
  HomeIcon,
  ChecklistIcon,
  CardIcon,
  GearIcon,
  BellIcon,
  PlusIcon,
  FilterIcon,
  SunIcon,
  MoonIcon,
} from "@/components/landing/icons";
import { useApp } from "./AppProvider";
import { usd, netStr } from "./data";

interface NavDef {
  href: string;
  label: string;
  icon: ReactNode;
  match?: (path: string) => boolean;
}

const PRIMARY: NavDef[] = [
  { href: "/app", label: "Dashboard", icon: <HomeIcon size={19} /> },
  { href: "/app/benefits", label: "Benefits", icon: <ChecklistIcon size={19} /> },
  {
    href: "/app/wallet",
    label: "Wallet",
    icon: <CardIcon size={19} />,
    match: (p) => p === "/app/wallet" || p.startsWith("/app/wallet/"),
  },
  { href: "/app/settings", label: "Settings", icon: <GearIcon size={19} /> },
];

function isActive(item: NavDef, pathname: string): boolean {
  if (item.match) return item.match(pathname);
  if (item.href === "/app") return pathname === "/app";
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function NavRow({
  item,
  active,
  badge,
  badgeTone = "accent",
  onNavigate,
}: {
  item: NavDef;
  active: boolean;
  badge?: ReactNode;
  badgeTone?: "accent" | "warning";
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center justify-between rounded-[11px] px-3 py-[10px] text-[14.5px] transition-colors",
        active
          ? "bg-accent-soft font-semibold text-accent"
          : "font-medium text-secondary hover:text-ink",
      )}
    >
      <span className="flex items-center gap-3">
        {item.icon}
        {item.label}
      </span>
      {badge != null && (
        <span
          className={cn(
            "tabular rounded-[7px] px-[7px] py-[2px] font-mono text-[11px] font-semibold",
            badgeTone === "warning"
              ? "bg-warning-soft text-warning"
              : "bg-accent-soft text-accent",
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

/** The sidebar's inner content, shared by the desktop pane and mobile drawer. */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useUser();
  const { derived, theme, toggleTheme } = useApp();

  const unread = useQuery(api.notifications.unreadCount) ?? 0;
  const amAdmin = useQuery(api.review.amIAdmin) ?? false;
  const pendingReviews = useQuery(api.review.pendingReviewCount) ?? 0;

  const name = user?.firstName ?? user?.fullName ?? "Maya";
  const initial = (name[0] ?? "M").toUpperCase();
  const photo = user?.hasImage ? clerkImageUrl(user.imageUrl, 34) : null;
  const cardCount = derived.cards.length;

  return (
    <>
      {/* Logo lockup */}
      <div className="flex items-center gap-[11px] px-5 pb-4 pt-[22px]">
        <BeeLogo size={32} gid="app-sidebar" />
        <span className="font-display text-[21px] font-semibold tracking-[-0.01em] text-ink">
          OfferBee
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-[3px] px-3 py-2">
        {PRIMARY.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            active={isActive(item, pathname)}
            onNavigate={onNavigate}
            badge={
              item.href === "/app/benefits" && derived.atRiskCount > 0
                ? derived.atRiskCount
                : undefined
            }
            badgeTone="warning"
          />
        ))}

        <div className="my-2 border-t border-separator" />

        <NavRow
          item={{ href: "/app/offers", label: "Offers", icon: <BellIcon size={19} /> }}
          active={isActive({ href: "/app/offers", label: "", icon: null }, pathname)}
          onNavigate={onNavigate}
          badge={unread > 0 ? unread : undefined}
        />
        <NavRow
          item={{ href: "/app/add", label: "Add card", icon: <PlusIcon size={19} /> }}
          active={isActive({ href: "/app/add", label: "", icon: null }, pathname)}
          onNavigate={onNavigate}
        />
        {amAdmin && (
          <NavRow
            item={{ href: "/app/review", label: "Review", icon: <FilterIcon size={19} /> }}
            active={isActive({ href: "/app/review", label: "", icon: null }, pathname)}
            onNavigate={onNavigate}
            badge={pendingReviews > 0 ? (pendingReviews > 200 ? "200+" : pendingReviews) : undefined}
            badgeTone="warning"
          />
        )}
      </nav>

      {/* Footer */}
      <div className="mt-auto flex flex-col gap-3 px-4 py-[14px]">
        {/* Net this year mini-card */}
        <div className="rounded-[14px] border border-border bg-surface-2 px-[14px] py-[13px]">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-tertiary">
            Net this year
          </div>
          <div className="tabular mt-[3px] font-mono text-[22px] font-semibold text-accent">
            {netStr(derived.net)}
          </div>
          <div className="mt-[2px] text-[11.5px] text-secondary">
            beating {usd(derived.fees)} in fees
          </div>
        </div>

        {/* User row */}
        <div className="flex items-center gap-[10px]">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt=""
              className="size-[34px] shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              className="flex size-[34px] shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#F5B14D,#E8680E)" }}
            >
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-ink">
              {name}
            </div>
            <div className="text-[11.5px] text-tertiary">
              Pro · {cardCount} cards
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "honey" ? "Switch to dark theme" : "Switch to light theme"}
            className="flex size-[34px] items-center justify-center rounded-[10px] border border-border bg-background text-secondary transition-colors hover:text-ink"
          >
            {theme === "honey" ? <MoonIcon size={18} /> : <SunIcon size={18} />}
          </button>
        </div>
      </div>
    </>
  );
}

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Desktop: static sticky pane */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile/tablet: slide-in drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className={cn(
            "absolute inset-0 bg-black/40 transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        {/* Panel */}
        <div
          className={cn(
            "absolute left-0 top-0 flex h-full w-[248px] max-w-[82vw] flex-col border-r border-border bg-surface shadow-ob transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <SidebarContent onNavigate={onClose} />
        </div>
      </div>
    </>
  );
}
