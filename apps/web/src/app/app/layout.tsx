import { type ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { RequireAuth } from "@/components/app/RequireAuth";

// The product area is protected client-side (RequireAuth), NOT via a Next
// middleware. A `proxy.ts`/`middleware.ts` here is bundled as a Netlify edge
// function and fails in this pnpm monorepo (@netlify/plugin-nextjs doubles the
// package path). Data is enforced server-side in Convex (requireUserId /
// requireAdmin) regardless.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
