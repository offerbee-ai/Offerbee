"use client";

import { type ReactNode, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app/cards", label: "Cards" },
  { href: "/app/add", label: "Add card" },
  { href: "/app/offers", label: "Offers" },
  { href: "/app/review", label: "Review" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureUser);
  const unread = useQuery(api.notifications.unreadCount) ?? 0;
  const amAdmin = useQuery(api.review.amIAdmin) ?? false;
  const pendingReviews = useQuery(api.review.pendingReviewCount) ?? 0;
  const ensured = useRef(false);

  // Review is an admin-only surface — drop it from the nav for everyone else.
  const nav = NAV.filter((item) => item.href !== "/app/review" || amAdmin);

  // Register the user with the shared backend on login (web + native both do this).
  // Gate on Convex auth (not just the Clerk user) so the token has been exchanged
  // before we call an authenticated mutation.
  useEffect(() => {
    if (!isAuthenticated || !user || ensured.current) return;
    ensured.current = true;
    ensureUser({
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName ?? undefined,
    }).catch((e) => console.error("ensureUser failed", e));
  }, [isAuthenticated, user, ensureUser]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-glass backdrop-blur-[16px]">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-5 py-3">
          <Link
            href="/app/cards"
            className="font-display text-[19px] font-semibold text-ink"
          >
            Offer<span className="text-accent">Bee</span>
          </Link>

          <nav className="flex items-center gap-1">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative rounded-button px-3 py-1.5 text-[14px] font-semibold transition-colors",
                    active
                      ? "bg-accent-soft text-accent"
                      : "text-body hover:text-accent",
                  )}
                >
                  {item.label}
                  {item.href === "/app/offers" && unread > 0 && (
                    <span className="ml-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">
                      {unread}
                    </span>
                  )}
                  {item.href === "/app/review" && pendingReviews > 0 && (
                    <span className="ml-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-warning px-1 text-[11px] font-bold text-white">
                      {pendingReviews > 200 ? "200+" : pendingReviews}
                    </span>
                  )}
                </Link>
              );
            })}
            <div className="ml-2">
              <UserButton />
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[960px] px-5 py-8">{children}</main>
    </div>
  );
}
