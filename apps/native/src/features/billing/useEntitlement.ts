import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

// Reactive entitlement: undefined while loading, null when unauthed, otherwise
// { hasAccess, status, plan, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd }.
export function useEntitlement() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.billing.getEntitlement, isAuthenticated ? {} : "skip");
}

// Paywall ledger ("Your trial so far"): { total, items: [{ title, cardName,
// count, amount }] }. total 0 ⇒ hide the ledger (never show it empty).
export function useTrialLedger() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.billing.getTrialLedger, isAuthenticated ? {} : "skip");
}
