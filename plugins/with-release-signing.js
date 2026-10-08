const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Release signing for the Android build.
 *
 *  1. The release build signs with YOUR keystore when BLUVFI_STORE_FILE is configured. Put these in your user-level
 *     ~/.gradle/gradle.properties (never in the repo; scripts/setup-release-signing.ps1 writes them for you):
 *
 *         BLUVFI_STORE_FILE=C:/path/to/your-release.keystore
 *         BLUVFI_STORE_PASSWORD=...
 *         BLUVFI_KEY_ALIAS=...
 *         BLUVFI_KEY_PASSWORD=...
 *
 *  2. A guard REFUSES to build a release APK that would be signed with the debug key, so one can never be shipped by accident. It lets a
 *     build through when the BLUVFI_ properties are set, when Android Studio's "Generate Signed App Bundle / APK" wizard supplies its own
 *     keystore, or when you pass -PALLOW_DEBUG_SIGNED_RELEASE=true for a throwaway test build.
 *
 * Done as a config plugin (not a hand-edit of android/app/build.gradle) so it survives `expo prebuild`, which regenerates that file.
 * The edits are pure functions so they can be tested without running a build.
 */
const MARKER = 'BLUVFI_STORE_FILE';
const GUARD_MARKER = 'refuse to produce a release signed with the debug key';

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

const GUARD_CONDITION =
  "releaseBuild && !project.hasProperty('BLUVFI_STORE_FILE') && !project.hasProperty('android.injected.signing.store.file') && !project.hasProperty('ALLOW_DEBUG_SIGNED_RELEASE')";
const OLD_GUARD_CONDITION = "releaseBuild && !project.hasProperty('BLUVFI_STORE_FILE') && !project.hasProperty('ALLOW_DEBUG_SIGNED_RELEASE')";

const GUARD_BLOCK = [
  '',
  `// Added by plugins/with-release-signing.js — ${GUARD_MARKER}.`,
  'gradle.taskGraph.whenReady { graph ->',
  '    def releaseBuild = graph.allTasks.any { t ->',
  '        t.project == project && t.name ==~ /(assemble|bundle|package)Release.*/',
  '    }',
  `    if (${GUARD_CONDITION}) {`,
  '        throw new GradleException(',
  "            'Release build needs the Bluvfi keystore: set BLUVFI_STORE_FILE, BLUVFI_STORE_PASSWORD, BLUVFI_KEY_ALIAS and ' +",
  "            'BLUVFI_KEY_PASSWORD in your user gradle.properties (see plugins/with-release-signing.js), ' +",
  "            'sign with Android Studio\\'s Generate Signed APK wizard, ' +",
  "            'or pass -PALLOW_DEBUG_SIGNED_RELEASE=true for a throwaway test build.')",
  '    }',
  '}',
  '',
].join('\n');

/** The release signing config, and the release build type using it when configured. Unchanged text when already there or unrecognised. */
function addSigningConfig(src) {
  if (src.includes("project.property('BLUVFI_STORE_FILE')")) return src;

  const debugBlock = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/;
  if (!debugBlock.test(src)) return src;
  let next = src.replace(debugBlock, `$1${RELEASE_SIGNING_CONFIG}`);

  const at = next.indexOf('buildTypes');
  if (at < 0) return src;
  const head = next.slice(0, at);
  const tail = next.slice(at);
  const releaseUsesDebug = /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseUsesDebug.test(tail)) return src;
  next = head + tail.replace(releaseUsesDebug, "$1signingConfig project.hasProperty('BLUVFI_STORE_FILE') ? signingConfigs.release : signingConfigs.debug");
  return next;
}

/** The guard against a debug-signed release. Adds it, or upgrades an older copy that didn't know about Android Studio's signing wizard. */
function addGuard(src) {
  if (src.includes(GUARD_MARKER)) {
    return src.includes('android.injected.signing.store.file') ? src : src.split(OLD_GUARD_CONDITION).join(GUARD_CONDITION);
  }
  return src.replace(/\s*$/, '\n') + GUARD_BLOCK;
}

/** Returns the build.gradle text with release signing and the guard in place (the same text if both already are). */
function addReleaseSigning(src) {
  const signed = addSigningConfig(src);
  // A template we don't recognise is left exactly as it was (a guard with no signing config behind it would only block builds).
  if (!signed.includes("project.property('BLUVFI_STORE_FILE')")) return src;
  return addGuard(signed);
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    const before = cfg.modResults.contents;
    const next = addReleaseSigning(before);
    if (!next.includes("project.property('BLUVFI_STORE_FILE')")) {
      console.warn('[with-release-signing] could not find the signing configs in app/build.gradle; release will not use your keystore.');
    }
    cfg.modResults.contents = next;
    return cfg;
  });
};
module.exports.addReleaseSigning = addReleaseSigning;
module.exports.addGuard = addGuard;
module.exports.addSigningConfig = addSigningConfig;
