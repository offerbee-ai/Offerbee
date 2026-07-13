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
        resizeMode: "contain",
        backgroundColor: "#FBF8F0",
        dark: { backgroundColor: "#17181B" },
      },
    ],
    "expo-font",
    "expo-secure-store",
    ["expo-notifications", { color: "#E8680E" }],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appEnv: APP_ENV,
    // eas.projectId gets added here by `eas init` when we start building.
  },
});
