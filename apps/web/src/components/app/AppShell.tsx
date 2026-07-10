"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { AppProvider, useApp } from "./AppProvider";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

// Two-pane authenticated shell (design_handoff_webapp): sticky sidebar + sticky
// glass topbar + a max-1180px content pane. Theme is driven by the `.theme-onyx`
// class on the root wrapper; CSS variables do the rest.
function Shell({ children }: { children: ReactNode }) {
  const { theme } = useApp();
  const pathname = usePathname();
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureUser);
  const ensured = useRef(false);

  // Register the user with the shared backend on login (web + native both do).
  // Gate on Convex auth so the token is exchanged before an authed mutation.
  useEffect(() => {
    if (!isAuthenticated || !user || ensured.current) return;
    ensured.current = true;
    ensureUser({
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName ?? undefined,
    }).catch((e) => console.error("ensureUser failed", e));
  }, [isAuthenticated, user, ensureUser]);

  return (
    <div
      className={cn(
        "ob-app flex min-h-screen bg-background text-ink",
        theme === "onyx" && "theme-onyx",
      )}
    >
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-[1180px] px-[34px] pb-14 pt-[30px]">
          {/* Re-key per route so the fade-in replays on navigation. */}
          <div key={pathname} className="animate-obfade">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
