const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Signs the release build with YOUR keystore when one is configured, and falls back to the debug key otherwise (so a fresh clone still
 * builds). The keystore and its passwords are never in the repo: put them in your user-level ~/.gradle/gradle.properties:
 *
 *     BLUVFI_STORE_FILE=C:/path/to/your-release.keystore
 *     BLUVFI_STORE_PASSWORD=...
 *     BLUVFI_KEY_ALIAS=...
 *     BLUVFI_KEY_PASSWORD=...
 *
 * Done as a config plugin (not a hand-edit of android/app/build.gradle) so it survives `expo prebuild`, which regenerates that file.
 * The edit is a pure function (addReleaseSigning) so it can be tested without running a build.
 */
const MARKER = 'BLUVFI_STORE_FILE';

const RELEASE_SIGNING_CONFIG = [
  '',
  '        release {',
  '            // Added by plugins/with-release-signing.js — real keystore from user-level gradle.properties (see that file).',
  "            if (project.hasProperty('BLUVFI_STORE_FILE')) {",
  "                storeFile file(project.property('BLUVFI_STORE_FILE'))",
  "                storePassword project.property('BLUVFI_STORE_PASSWORD')",
  "                keyAlias project.property('BLUVFI_KEY_ALIAS')",
  "                keyPassword project.property('BLUVFI_KEY_PASSWORD')",
  '            }',
  '        }',
].join('\n');

/** Returns the build.gradle text with release signing added, or the same text if it is already there or the template isn't recognised. */
function addReleaseSigning(src) {
  if (src.includes(MARKER)) return src;

  // 1. a `release` signing config right after the debug one
  const debugBlock = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/;
  if (!debugBlock.test(src)) return src;
  let next = src.replace(debugBlock, `$1${RELEASE_SIGNING_CONFIG}`);

  // 2. the release build type uses it when configured (the template points it at the debug key)
  const at = next.indexOf('buildTypes');
  if (at < 0) return src;
  const head = next.slice(0, at);
  const tail = next.slice(at);
  const releaseUsesDebug = /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseUsesDebug.test(tail)) return src;
  next = head + tail.replace(releaseUsesDebug, "$1signingConfig project.hasProperty('BLUVFI_STORE_FILE') ? signingConfigs.release : signingConfigs.debug");
  return next;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    const next = addReleaseSigning(cfg.modResults.contents);
    if (next === cfg.modResults.contents && !cfg.modResults.contents.includes(MARKER)) {
      console.warn('[with-release-signing] could not find the signing configs in app/build.gradle; release will use the debug key.');
    }
    cfg.modResults.contents = next;
    return cfg;
  });
};
module.exports.addReleaseSigning = addReleaseSigning;
