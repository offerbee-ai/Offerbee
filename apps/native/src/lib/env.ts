import Constants from "expo-constants";

export type AppEnv = "development" | "preview" | "production";

// Set by app.config.ts from APP_ENV at bundle time.
export const appEnv: AppEnv =
  ((Constants.expoConfig?.extra as { appEnv?: AppEnv } | undefined)?.appEnv ??
    "development") as AppEnv;

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name} — check apps/native/.env.${appEnv} and start via the matching script (dev / dev:preview / dev:prod)`,
    );
  }
  return value;
}

// EXPO_PUBLIC_* vars must be referenced statically for Metro to inline them.
export const env = {
  appEnv,
  convexUrl: required("EXPO_PUBLIC_CONVEX_URL", process.env.EXPO_PUBLIC_CONVEX_URL),
  clerkPublishableKey: required(
    "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  ),
} as const;
