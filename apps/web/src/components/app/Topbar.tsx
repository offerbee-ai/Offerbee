"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { MenuIcon } from "@/components/landing/icons";

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Eyebrow + title for the current route. Dashboard is computed live. */
function useTitle(pathname: string, name: string): { eyebrow: string; title: string } {
  // Live date + greeting for the dashboard, mount-only to avoid SSR mismatch.
  const [dash, setDash] = useState<{ eyebrow: string; title: string }>({
    eyebrow: "Today",
    title: `Welcome back, ${name}`,
  });
  useEffect(() => {
    const now = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDash({
      eyebrow: now.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
      title: `${greetingFor(now.getHours())}, ${name}`,
    });
  }, [name]);

  if (pathname === "/app") return dash;
  const map: Record<string, { eyebrow: string; title: string }> = {
    "/app/benefits": { eyebrow: "All credits", title: "Benefits" },
    "/app/settings": { eyebrow: "Preferences", title: "Settings" },
    "/app/offers": { eyebrow: "What to do next", title: "Alerts & Notifications" },
    "/app/tips": { eyebrow: "Get the most from your cards", title: "Tips & Offers" },
    "/app/add": { eyebrow: "Build your wallet", title: "Add a card" },
    "/app/add/search": { eyebrow: "Build your wallet", title: "Search cards" },
    "/app/wallet": { eyebrow: "Owned cards", title: "Wallet" },
    "/app/review": { eyebrow: "Data quality", title: "Review" },
  };
  if (pathname.startsWith("/app/wallet/"))
    return { eyebrow: "Card detail", title: "Card" };
  return map[pathname] ?? { eyebrow: "OfferBee", title: "OfferBee" };
}

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const pathname = usePathname();
  const { user } = useUser();
  const name = user?.firstName ?? user?.fullName ?? "Maya";
  const { eyebrow, title } = useTitle(pathname, name);

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-glass px-4 py-3 backdrop-blur-[14px] backdrop-saturate-150 sm:px-6 lg:px-[34px] lg:py-4">
      <div className="mx-auto flex max-w-[1180px] items-center gap-2 sm:gap-4">
        {/* Hamburger — opens the nav drawer below lg */}
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open menu"
          className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-[10px] text-ink transition-colors hover:bg-surface-2 lg:hidden"
        >
          <MenuIcon size={22} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[11px] font-medium tracking-[0.04em] text-tertiary">
            {eyebrow}
          </div>
          <h1 className="truncate font-display text-[20px] font-semibold tracking-[-0.02em] text-ink sm:text-[26px]">
            {title}
          </h1>
        </div>
      </div>
    </div>
  );
}
