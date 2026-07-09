"use client";

import { type ReactNode } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { Spinner } from "@/components/app/ui";

// Client-side gate for the product area. We protect /app here (not via a Next
// middleware / proxy.ts) because middleware is bundled as a Netlify edge
// function and fails in this pnpm monorepo. Data is enforced server-side in
// Convex regardless; this only redirects signed-out visitors to sign-in.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );

  if (!isSignedIn) return <RedirectToSignIn />;

  return <>{children}</>;
}
