const { withInfoPlist, withEntitlementsPlist } = require("expo/config-plugins");

// Release hardening for non-development builds.
//
// `expo prebuild` always emits a development-flavored native project:
//   - `aps-environment` = "development" (sandbox APNs)
//   - Expo dev-client Metro-discovery keys (NSBonjourServices `_expo._tcp` +
//     an "Expo Dev Launcher …" NSLocalNetworkUsageDescription)
// EAS Build would flip these for release, but this app ships via Xcode Cloud
// (no EAS), so we correct them here for every non-development APP_ENV. A
// Distribution-signed archive with `development` would register sandbox push
// tokens and silently drop production pushes; the dev-launcher local-network
// string is also confusing in a shipping app.
//
// `development` is intentionally left untouched so local dev-client Metro
// discovery and sandbox push keep working. This plugin must be listed LAST in
// app.config.ts `plugins` so it overrides expo-notifications / expo-dev-client.

const IS_DEV = (process.env.APP_ENV ?? "development") === "development";

function withProductionApsEnvironment(config) {
  return withEntitlementsPlist(config, (config) => {
    config.modResults["aps-environment"] = "production";
    return config;
  });
}

function withoutExpoDevNetworkKeys(config) {
  return withInfoPlist(config, (config) => {
    delete config.modResults.NSBonjourServices;
    delete config.modResults.NSLocalNetworkUsageDescription;
    return config;
  });
}

module.exports = function withIosReleaseHardening(config) {
  if (IS_DEV) return config;
  config = withProductionApsEnvironment(config);
  config = withoutExpoDevNetworkKeys(config);
  return config;
};
