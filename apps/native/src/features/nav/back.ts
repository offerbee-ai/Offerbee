import { router, type Href } from "expo-router";

/**
 * Pop the navigation stack, or fall back to a real route when this screen is
 * the stack root. A pushed screen can become the root via a deep link,
 * notification tap, or cold launch — and bare `router.back()` throws
 * "The action 'GO_BACK' was not handled by any navigator" in that case,
 * leaving the back button dead. Callers pass the sensible parent route.
 */
export function goBack(fallback: Href = "/") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
