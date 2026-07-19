import type { ConfigContext, ExpoConfig } from "expo/config";

export type AppEnv = "development" | "preview" | "production";

const APP_ENV: AppEnv = (() => {
  const value = process.env.APP_ENV ?? "development";
  if (value !== "development" && value !== "preview" && value !== "production") {
    throw new Error(`Unknown APP_ENV "${value}" — use development | preview | production`);
  }
  return value;
})();

// Identity model:
// - `development` is isolated (`.dev` bundle + own scheme) so a local dev build
//   installs side by side with the shipping app on one device.
// - `preview` and `production` are the SAME shipping app (`ai.offerbee.app`,
//   scheme `offerbee`). They differ only by BACKEND, chosen at build time via the
//   EXPO_PUBLIC_* env (staging Convex/Clerk for TestFlight beta, prod for release).
//   One App Store Connect record carries the app from beta all the way to launch.
const ENV = {
  development: {
    name: "OfferBee (Dev)",
    bundleId: "ai.offerbee.app.dev",
    scheme: "offerbee-dev",
  },
  preview: {
    name: "OfferBee",
    bundleId: "ai.offerbee.app",
    scheme: "offerbee",
  },
  production: {
    name: "OfferBee",
    bundleId: "ai.offerbee.app",
    scheme: "offerbee",
  },
}[APP_ENV];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: ENV.name,
  slug: "offerbee",
  owner: "ronnie434",
  scheme: ENV.scheme,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: false,
    bundleIdentifier: ENV.bundleId,
    // Sign in with Apple entitlement (native Apple SSO via Clerk).
    usesAppleSignIn: true,
    infoPlist: {
      // App uses only standard/exempt encryption (HTTPS). Declaring this here
      // skips the manual export-compliance prompt on every App Store Connect
      // upload, so Xcode Cloud → TestFlight is fully automated.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: ENV.bundleId,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundImage: "./assets/adaptive-bg.png",
      backgroundColor: "#FF8A00",
    },
  },
  web: {
    bundler: "metro",
    favicon: "./assets/favicon.png",
  },
  plugins: [
    ["expo-router", { root: "./src/app" }],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#FBF8F0",
        dark: { backgroundColor: "#17181B" },
      },
    ],
    "expo-font",
    "expo-secure-store",
    "expo-apple-authentication",
    ["expo-notifications", { color: "#E8680E" }],
    // iOS deployment floor (Xcode 27 SDK rejects pods below 15.0; @clerk/expo's
    // native module requires 17.0).
    ["expo-build-properties", { ios: { deploymentTarget: "17.0" } }],
    // expo-build-properties misses pod resource-bundle sub-targets (12.4/13.4) — bump them too.
    "./plugins/with-ios-pod-min-deployment-target",
    // UIScene lifecycle adoption — required on the iOS 26+/27 SDK or UIKit traps at launch.
    "./plugins/with-ios-scene-lifecycle",
    // Local iOS dev-build fixes (Debug only): on-device Metro host/port + script sandbox.
    "./plugins/with-ios-dev-build",
    // Bake the Apple Developer Team + automatic signing into the project so it
    // survives `expo prebuild --clean` (manual Xcode team selection does not).
    "./plugins/with-ios-signing",
    // Non-development builds only: aps-environment=production + strip Expo
    // dev-client local-network keys. Must stay LAST so it overrides the above.
    "./plugins/with-ios-release-hardening",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appEnv: APP_ENV,
    eas: { projectId: "e6bd622d-a032-4d5c-90b5-2ad4cea7e7a8" },
  },
});
