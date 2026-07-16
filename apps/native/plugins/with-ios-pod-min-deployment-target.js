const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// The Xcode 27 SDK rejects deployment targets below 15.0. `expo-build-properties`
// sets the app + most pods, but a few pods (RNCAsyncStorage, RNSVG) ship
// resource-bundle sub-targets pinned lower (12.4 / 13.4) that it doesn't touch.
// This appends a post_install loop bumping EVERY pod build-config to the floor.
// (Only needed while building against the beta iOS 27 SDK; harmless otherwise.)

const MIN = "16.4";
const MARKER = "with-ios-pod-min-deployment-target";
const LOOP = `
    # Added by ${MARKER}: Xcode 27 SDK rejects deployment targets below 15.0; a few
    # pods ship resource-bundle sub-targets pinned lower. Bump every pod target.
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || current.to_f < ${MIN}
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN}'
        end
      end
    end
`;

module.exports = function withIosPodMinDeploymentTarget(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfile = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let contents = fs.readFileSync(podfile, "utf8");
      if (contents.includes(MARKER)) {
        return config;
      }
      const patched = contents.replace(
        /(react_native_post_install\([\s\S]*?\n\s*\)\n)/,
        `$1${LOOP}`
      );
      if (patched === contents) {
        throw new Error(
          "with-ios-pod-min-deployment-target: could not find react_native_post_install(...) to append to; Podfile template may have changed."
        );
      }
      fs.writeFileSync(podfile, patched);
      return config;
    },
  ]);
};
