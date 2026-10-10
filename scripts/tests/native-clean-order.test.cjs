/**
 * The native-clean ordering plugin (plugins/with-native-clean-order.js): a Gradle `clean` must not delete the folders CMake still needs
 * before the app's own native clean has run (that made Android Studio's clean fail with "add_subdirectory given source … not an existing
 * directory"). The edit is a pure function, so no build is needed.
 *
 *     node scripts/tests/native-clean-order.test.cjs
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { reporter } = require("./_harness.cjs");
const { check, finish } = reporter();

const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "@expo/config-plugins") return { withAppBuildGradle: (cfg, fn) => fn({ ...cfg, modResults: cfg.modResults ?? { language: "groovy", contents: "" } }) };
  return realLoad.call(this, request, ...rest);
};
const plugin = require("../../plugins/with-native-clean-order.js");
Module._load = realLoad;

const STOCK = "android {\n    compileSdk 36\n}\n";
const once = plugin.addCleanOrder(STOCK);
check("the rule is appended to a stock build.gradle and the original is kept", once.startsWith(STOCK) && once.includes("gradle.projectsEvaluated"));
check("it is idempotent (running prebuild twice adds it once)", plugin.addCleanOrder(once) === once && once.split(plugin.MARKER).length === 2);
check("every library's clean is told to run after the app's native clean tasks (the real task names start with externalNativeBuildClean)", once.includes("it.name == 'clean'") && once.includes("mustRunAfter(rootProject.project(':app').tasks.matching { t -> t.name.startsWith('externalNativeBuildClean') })") && once.includes("sub.path != ':app'"));
check("it never names the ambiguous ':app:externalNativeBuildClean' (that is only an abbreviation, not a task)", !once.includes("':app:externalNativeBuildClean'"));
check("a file with no trailing newline is handled", plugin.addCleanOrder("x").includes("\n// Added by"));
check("the wrapper changes the generated file's contents through the Expo hook", (() => { const out = plugin({ modResults: { language: "groovy", contents: STOCK } }); return out.modResults.contents.includes(plugin.MARKER); })());
check("a non-Groovy build file is left alone", plugin({ modResults: { language: "kt", contents: "x" } }).modResults.contents === "x");

const aj = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
check("the plugin is registered in app.json, so a prebuild keeps it", aj.expo.plugins.includes("./plugins/with-native-clean-order"));
const gen = path.join(__dirname, "../../android/app/build.gradle");
if (fs.existsSync(gen)) check("the generated build.gradle on this machine has it", fs.readFileSync(gen, "utf8").includes(plugin.MARKER));

finish();
