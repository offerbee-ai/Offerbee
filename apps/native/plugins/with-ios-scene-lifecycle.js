const { withInfoPlist, withAppDelegate } = require("expo/config-plugins");

// The iOS 26+/27 SDK enforces UIScene lifecycle adoption. React Native 0.86 /
// Expo SDK 55 still generate the legacy app-delegate window lifecycle (no scene
// manifest), so building against the iOS 27 SDK makes UIKit hard-trap at launch
// (EXC_BREAKPOINT in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
//
// This plugin adds a full scene manifest + a SceneDelegate that owns the window,
// and strips the window setup out of AppDelegate.didFinishLaunching. Prod-relevant:
// once iOS 27 ships stable, TestFlight/App Store builds will hit the same trap.

const SCENE_DELEGATE_CLASS = `
// Added by with-ios-scene-lifecycle: the iOS 26+/27 SDK requires UIScene adoption;
// without it UIKit hard-traps at launch. This scene delegate owns the window and
// starts React Native into it. Wired via Info.plist UIApplicationSceneManifest.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory
    else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: nil)
  }
}
`;

function withSceneInfoPlist(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return config;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== "swift") {
      throw new Error(
        `with-ios-scene-lifecycle expects a Swift AppDelegate, got ${config.modResults.language}`
      );
    }
    let src = config.modResults.contents;

    // 1. ensure `import UIKit`
    if (!/^\s*import UIKit\s*$/m.test(src)) {
      src = src.replace(
        /^(import ReactAppDependencyProvider\s*)$/m,
        "$1\nimport UIKit"
      );
    }

    // 2. remove the app-delegate window setup — the SceneDelegate owns the window now
    src = src.replace(
      /#if os\(iOS\) \|\| os\(tvOS\)[\s\S]*?startReactNative\([\s\S]*?#endif\n?/,
      "// Window + React Native root created in SceneDelegate (UIScene lifecycle,\n    // required on the iOS 26+/27 SDK).\n"
    );

    // 3. append the SceneDelegate class once
    if (!src.includes("class SceneDelegate")) {
      src = `${src.trimEnd()}\n${SCENE_DELEGATE_CLASS}`;
    }

    config.modResults.contents = src;
    return config;
  });
}

module.exports = function withIosSceneLifecycle(config) {
  config = withSceneInfoPlist(config);
  config = withSceneAppDelegate(config);
  return config;
};
