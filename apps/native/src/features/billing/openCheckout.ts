import { useAction } from "convex/react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api } from "@packages/backend/convex/_generated/api";

// Opens Stripe Checkout in an in-app auth session. Stripe's success/cancel
// redirects target our app scheme (returnUrl), so the browser sheet closes
// itself instead of loading SITE_URL — a web origin the device can't always
// reach (localhost in dev) and never wants to render mid-flow. No deep-link
// handling needed on return: the entitlement query is reactive, so the
// paywall dismisses the moment the webhook lands.
export function useOpenCheckout() {
  const createCheckout = useAction(api.billing.createCheckoutSession);
  return async (plan: "monthly" | "yearly") => {
    const returnUrl = Linking.createURL("billing-return");
    const { url } = await createCheckout({ plan, platform: "native", returnUrl });
    await WebBrowser.openAuthSessionAsync(url, returnUrl);
  };
}

export function useOpenPortal() {
  const createPortal = useAction(api.billing.createPortalSession);
  return async () => {
    const { url } = await createPortal({});
    await WebBrowser.openBrowserAsync(url);
  };
}
