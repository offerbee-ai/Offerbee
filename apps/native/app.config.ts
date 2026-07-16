import type { ConfigContext, ExpoConfig } from "expo/config";

export type AppEnv = "development" | "preview" | "production";

const APP_ENV: AppEnv = (() => {
  const value = process.env.APP_ENV ?? "development";
  if (value !== "development" && value !== "preview" && value !== "production") {
    throw new Error(`Unknown APP_ENV "${value}" — use development | preview | production`);
  }
  return value;
})();

// Per-environment identity. Distinct bundle ids let dev/preview/production
// builds install side by side on one device; distinct schemes keep deep links
// from colliding.
const ENV = {
  development: {
    name: "OfferBee (Dev)",
    bundleId: "ai.offerbee.app.dev",
    scheme: "offerbee-dev",
  },
  preview: {
    name: "OfferBee (Preview)",
    bundleId: "ai.offerbee.app.preview",
    scheme: "offerbee-preview",
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
    ["expo-notifications", { color: "#E8680E" }],
    // iOS deployment floor (Xcode 27 SDK rejects pods below 15.0; app targets 16.4).
    ["expo-build-properties", { ios: { deploymentTarget: "16.4" } }],
    // expo-build-properties misses pod resource-bundle sub-targets (12.4/13.4) — bump them too.
    "./plugins/with-ios-pod-min-deployment-target",
    // UIScene lifecycle adoption — required on the iOS 26+/27 SDK or UIKit traps at launch.
    "./plugins/with-ios-scene-lifecycle",
    // Local iOS dev-build fixes (Debug only): on-device Metro host/port + script sandbox.
    "./plugins/with-ios-dev-build",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appEnv: APP_ENV,
    eas: { projectId: "e6bd622d-a032-4d5c-90b5-2ad4cea7e7a8" },
  },
});
