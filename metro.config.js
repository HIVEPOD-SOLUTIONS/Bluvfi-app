const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// A handful of @privy-io/expo's dependencies (jose, isows, zustand — called
// out explicitly in Privy's own install docs) ship a package.json "exports"
// map with no "react-native" condition. Metro falls through to their
// "require"/node build, which imports Node-only modules (jose's build pulls
// in `util`/`zlib`) and crashes the RN bundle. Each of these also ships a
// "browser" condition pointing at an isomorphic build that works fine in RN.
//
// Scoped to just these packages rather than a global condition-order change
// or `unstable_enablePackageExports = false`: prioritizing "browser" for
// every package risks breaking other libraries whose browser build assumes
// DOM APIs (window/document) that RN doesn't have either, and disabling
// package-exports resolution entirely breaks legitimate subpath exports
// this project uses, e.g. `@privy-io/expo/passkey`.
const BROWSER_CONDITION_PACKAGES = new Set(['jose', 'isows', 'zustand']);

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pkgName = moduleName.split('/')[0] === '@' ? moduleName.split('/').slice(0, 2).join('/') : moduleName.split('/')[0];

  if (BROWSER_CONDITION_PACKAGES.has(pkgName)) {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: ['browser', 'require'] },
      moduleName,
      platform,
    );
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
