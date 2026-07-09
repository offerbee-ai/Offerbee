import { useEffect, useRef } from "react";
import { useUser } from "@clerk/clerk-expo";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { usePushNotifications } from "../hooks/usePushNotifications";

// Mounted inside the authenticated group. Registers the user with the shared
// backend (same as web) and sets up push-token registration + listeners.
export function PushRegistrar() {
  const { user } = useUser();
  const ensureUser = useMutation(api.users.ensureUser);
  const ensured = useRef(false);

  usePushNotifications();

  useEffect(() => {
    if (!user || ensured.current) return;
    ensured.current = true;
    ensureUser({
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName ?? undefined,
    }).catch((e) => console.error("ensureUser failed", e));
  }, [user, ensureUser]);

  return null;
}
