const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Caps how many C++ files compile at once in the Android native build.
 *
 * Ninja defaults to roughly (CPU count + 2) concurrent clang++ jobs. A few
 * React Native / react-native-screens translation units are template-heavy
 * and need well over 1 GB each when built with debug info, so on a 12-core
 * machine the compiles together exhaust Windows' commit limit and clang dies
 * with "LLVM ERROR: out of memory". A CMake job pool keeps the compile phase
 * to 2 jobs at a time — slower, but it finishes.
 *
 * Done as a config plugin (not a hand-edit of android/app/build.gradle) so it
 * survives `expo prebuild`, which regenerates that file.
 */
const POOL_SIZE = 2;
const MARKER = 'CMAKE_JOB_POOLS';

module.exports = function withLimitedCppParallelism(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    const src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    const block =
      `\n        // Added by plugins/with-limited-cpp-parallelism.js — limits concurrent C++ compiles (see that file).\n` +
      `        externalNativeBuild {\n` +
      `            cmake {\n` +
      `                arguments "-D${MARKER}=compile=${POOL_SIZE}", "-DCMAKE_JOB_POOL_COMPILE=compile"\n` +
      `            }\n` +
      `        }\n`;

    const next = src.replace(/(defaultConfig\s*\{[\s\S]*?versionName\s+"[^"]*"[^\n]*\n)/, `$1${block}`);
    if (next === src) {
      console.warn('[with-limited-cpp-parallelism] could not find defaultConfig/versionName in app/build.gradle; no change made.');
      return cfg;
    }
    cfg.modResults.contents = next;
    return cfg;
  });
};
