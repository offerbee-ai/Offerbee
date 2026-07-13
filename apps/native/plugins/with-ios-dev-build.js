const { withAppDelegate, withXcodeProject } = require("expo/config-plugins");

// Local iOS dev-build fixes (Debug only; no effect on Release / TestFlight / App
// Store builds, which load the embedded jsbundle):
//
//  1. Metro host/port: a plain RN debug build (no expo-dev-client) can't reach Metro
//     on a physical device — RN can't guess the packager host, and Metro here runs on
//     a non-default port (Docker holds 8081). We read the current Mac IP that
//     react-native-xcode.sh bakes into ip.txt on EVERY build (so it follows you across
//     Wi-Fi networks with no edits) and pin the port. Port is env-driven:
//         EXPO_DEV_METRO_PORT=8083 (default) — set it + re-run prebuild to change.
//     On the simulator packagerServerHost() is "localhost", so the ip.txt read is
//     skipped and only the port is pinned.
//  2. ENABLE_USER_SCRIPT_SANDBOXING = NO: the "Bundle React Native code and images"
//     phase writes ip.txt into the app bundle; script sandboxing blocks that write.

const METRO_PORT = process.env.EXPO_DEV_METRO_PORT || "8083";

const BUNDLE_URL_ORIGINAL =
  'return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")';

const BUNDLE_URL_REPLACEMENT = `// Added by with-ios-dev-build: pin the Metro host/port for on-device debug loads.
    let settings = RCTBundleURLProvider.sharedSettings()
    var host = settings.packagerServerHost()
    if host.isEmpty,
       let ipPath = Bundle.main.path(forResource: "ip", ofType: "txt"),
       let ip = try? String(contentsOfFile: ipPath, encoding: .utf8)
         .trimmingCharacters(in: .whitespacesAndNewlines),
       !ip.isEmpty {
      host = ip
    }
    if !host.isEmpty {
      settings.jsLocation = "\\(host):${METRO_PORT}"
    }
    return settings.jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")`;

function withDevMetroBundleURL(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== "swift") {
      throw new Error(
        `with-ios-dev-build expects a Swift AppDelegate, got ${config.modResults.language}`
      );
    }
    const src = config.modResults.contents;
    if (!src.includes(BUNDLE_URL_ORIGINAL)) {
      // Already patched, or the template changed — don't silently no-op on a template change.
      if (!src.includes('settings.jsLocation = "\\(host):')) {
        throw new Error(
          "with-ios-dev-build: could not find the bundleURL() line to patch; RN/Expo template may have changed."
        );
      }
      return config;
    }
    config.modResults.contents = src.replace(
      BUNDLE_URL_ORIGINAL,
      BUNDLE_URL_REPLACEMENT
    );
    return config;
  });
}

function withScriptSandboxDisabled(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(buildConfigs)) {
      const entry = buildConfigs[key];
      if (entry && typeof entry === "object" && entry.buildSettings) {
        entry.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = "NO";
      }
    }
    return config;
  });
}

module.exports = function withIosDevBuild(config) {
  config = withDevMetroBundleURL(config);
  config = withScriptSandboxDisabled(config);
  return config;
};
