const { withXcodeProject } = require("expo/config-plugins");

// Bake the Apple Developer Team + automatic signing into the generated Xcode
// project. `expo prebuild --clean` regenerates project.pbxproj from scratch and
// drops any team selected manually in Xcode, so without this every regeneration
// de-configures signing on the committed project. Applied to all envs (one
// Apple team). Xcode Cloud still manages the actual certs/profiles at build
// time; this just keeps the committed project self-consistent + openable
// locally without re-picking the team.

const APPLE_TEAM_ID = "JRBD76VZ75";

module.exports = function withIosSigning(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(buildConfigs)) {
      const buildSettings = buildConfigs[key]?.buildSettings;
      // App-target configs carry PRODUCT_BUNDLE_IDENTIFIER; Pods configs don't.
      if (!buildSettings || buildSettings.PRODUCT_BUNDLE_IDENTIFIER === undefined) {
        continue;
      }
      buildSettings.DEVELOPMENT_TEAM = APPLE_TEAM_ID;
      buildSettings.CODE_SIGN_STYLE = "Automatic";
    }
    return config;
  });
};
