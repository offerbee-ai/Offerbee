"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { SearchIcon, PlusIcon } from "@/components/landing/icons";
import { useApp } from "./AppProvider";
import { CARDS_BASE } from "./data";

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
  if (pathname.startsWith("/app/cards/")) {
    const id = decodeURIComponent(pathname.split("/")[3] ?? "");
    const card = CARDS_BASE.find((c) => c.id === id);
    return { eyebrow: "Card detail", title: card?.name ?? "Card detail" };
  }
  const map: Record<string, { eyebrow: string; title: string }> = {
    "/app/benefits": { eyebrow: "All credits", title: "Benefits" },
    "/app/expiring": { eyebrow: "Act before they reset", title: "Expiring soon" },
    "/app/cards": { eyebrow: "Fee vs. value", title: "Your cards" },
    "/app/settings": { eyebrow: "Preferences", title: "Settings" },
    "/app/offers": { eyebrow: "What to do next", title: "Offers" },
    "/app/add": { eyebrow: "Build your wallet", title: "Add a card" },
    "/app/wallet": { eyebrow: "Owned cards", title: "Wallet" },
    "/app/review": { eyebrow: "Data quality", title: "Review" },
  };
  if (pathname.startsWith("/app/wallet/"))
    return { eyebrow: "Card detail", title: "Card" };
  return map[pathname] ?? { eyebrow: "OfferBee", title: "OfferBee" };
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const { search, setSearch } = useApp();
  const name = user?.firstName ?? user?.fullName ?? "Maya";
  const { eyebrow, title } = useTitle(pathname, name);

  // The search field filters credits on the Benefits view; from anywhere else,
  // typing jumps there so the query has somewhere to land.
  const onSearch = (v: string) => {
    setSearch(v);
    if (v && pathname !== "/app/benefits") router.push("/app/benefits");
  };

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-glass px-[34px] py-4 backdrop-blur-[14px] backdrop-saturate-150">
      <div className="mx-auto flex max-w-[1180px] items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] font-medium tracking-[0.04em] text-tertiary">
            {eyebrow}
          </div>
          <h1 className="truncate font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">
            {title}
          </h1>
        </div>

        <label className="flex w-[250px] items-center gap-2 rounded-[11px] border border-border bg-surface px-[13px] py-[9px] text-tertiary focus-within:border-accent">
          <SearchIcon size={17} />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search credits…"
            className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-tertiary"
          />
        </label>

        <Link
          href="/app/add"
          className="flex shrink-0 items-center gap-1.5 rounded-[11px] bg-accent px-4 py-[10px] text-[14px] font-semibold text-on-accent shadow-[0_6px_16px_rgba(232,104,14,.22)] transition-colors hover:bg-accent-strong"
        >
          <PlusIcon size={18} />
          Add card
        </Link>
      </div>
    </div>
  );
}
