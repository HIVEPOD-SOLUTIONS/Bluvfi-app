const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Makes a Gradle `clean` (Android Studio's Clean Project / Rebuild, or a sync that triggers one) work.
 *
 * The native build's CMake files point at folders each library generates under node_modules/<library>/android/build. `clean` deletes those
 * folders, and if a library's `clean` runs before the app's `externalNativeBuildClean`, that task re-runs CMake against folders that are
 * already gone and fails with "add_subdirectory given source … which is not an existing directory". Telling every library's `clean` to run
 * AFTER the app's native clean keeps them in place until it is done; the next build regenerates them.
 *
 * Done as a config plugin (not a hand-edit of android/app/build.gradle) so it survives `expo prebuild`, which regenerates that file.
 */
const MARKER = 'with-native-clean-order';

const BLOCK = [
  '',
  `// Added by plugins/${MARKER}.js — libraries' clean must not delete the generated CMake inputs before the app's native clean has run (see that file).`,
  'gradle.projectsEvaluated {',
  '    rootProject.subprojects.each { sub ->',
  "        if (sub.path != ':app') {",
  "            sub.tasks.matching { it.name == 'clean' }.configureEach { it.mustRunAfter(rootProject.project(':app').tasks.matching { t -> t.name.startsWith('externalNativeBuildClean') }) }",
  '        }',
  '    }',
  '}',
  '',
].join('\n');

/** The app's build.gradle with the ordering rule appended (unchanged when it is already there). */
function addCleanOrder(src) {
  if (src.includes(MARKER)) return src;
  return src.endsWith('\n') ? src + BLOCK : `${src}\n${BLOCK}`;
}

module.exports = function withNativeCleanOrder(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    cfg.modResults.contents = addCleanOrder(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.addCleanOrder = addCleanOrder;
module.exports.MARKER = MARKER;
