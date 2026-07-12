const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..", "..");

const config = getDefaultConfig(projectRoot);

// The web app runs React 19.2 while React Native 0.81 needs React 19.1, so pnpm
// (hoisted) nests 19.2 copies inside shared deps (e.g. use-sync-external-store,
// react-dom). If Metro resolves one of those, two React copies end up in the
// bundle and every hook throws "Invalid hook call". Force single copies of the
// React runtime family onto the versions this app was built against.
// Locations resolved from the app's own dependency graph at config-load time,
// so pnpm re-hoisting between installs can't leave these pointing at nothing.
const SINGLETONS = Object.fromEntries(
  ["react", "react-dom", "react-native", "scheduler"].map((name) => [
    name,
    path.dirname(require.resolve(`${name}/package.json`, { paths: [projectRoot] })),
  ]),
);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const name = Object.keys(SINGLETONS).find(
    (n) => moduleName === n || moduleName.startsWith(`${n}/`),
  );
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (name) {
    const redirected = SINGLETONS[name] + moduleName.slice(name.length);
    return resolve(context, redirected, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
