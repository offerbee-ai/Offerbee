import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

// Reactive entitlement: undefined while loading, null when unauthed, otherwise
// { hasAccess, status, plan, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd }.
export function useEntitlement() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.billing.getEntitlement, isAuthenticated ? {} : "skip");
}
