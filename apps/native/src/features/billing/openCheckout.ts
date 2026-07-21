import { useAction } from "convex/react";
import * as WebBrowser from "expo-web-browser";
import { api } from "@packages/backend/convex/_generated/api";

// Opens Stripe Checkout in an in-app browser. No deep link back: the
// entitlement query is reactive, so the paywall guard dismisses itself the
// moment the webhook lands.
export function useOpenCheckout() {
  const createCheckout = useAction(api.billing.createCheckoutSession);
  return async (plan: "monthly" | "yearly") => {
    const { url } = await createCheckout({ plan, platform: "native" });
    await WebBrowser.openBrowserAsync(url);
  };
}

export function useOpenPortal() {
  const createPortal = useAction(api.billing.createPortalSession);
  return async () => {
    const { url } = await createPortal({});
    await WebBrowser.openBrowserAsync(url);
  };
}
