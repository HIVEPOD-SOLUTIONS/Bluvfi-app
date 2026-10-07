/**
 * The release-signing config plugin (plugins/with-release-signing.js): it must add the signing setup to a fresh Expo-generated
 * app/build.gradle, leave an already-patched one alone, and never put a keystore or password in the repo. The edit is a pure function,
 * so no build is needed.
 *
 *     node scripts/tests/release-signing.test.cjs
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { reporter } = require("./_harness.cjs");
const { check, finish } = reporter();

// the plugin requires @expo/config-plugins only to register itself; give it a stand-in so this runs anywhere
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "@expo/config-plugins") return { withAppBuildGradle: (cfg, fn) => fn({ ...cfg, modResults: cfg.modResults ?? { language: "groovy", contents: "" } }) };
  return realLoad.call(this, request, ...rest);
};
const plugin = require("../../plugins/with-release-signing.js");
Module._load = realLoad;
const add = plugin.addReleaseSigning;

// the shape of the signing parts of a stock Expo build.gradle
const STOCK = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}
`;

const out = add(STOCK);
check("a stock build.gradle gets a release signing config that reads the keystore from gradle properties", out.includes("release {") && out.includes("project.property('BLUVFI_STORE_FILE')") && out.includes("project.property('BLUVFI_KEY_ALIAS')"));
check("the release build uses it when configured and falls back to the debug key otherwise (a fresh clone still builds)", out.includes("signingConfig project.hasProperty('BLUVFI_STORE_FILE') ? signingConfigs.release : signingConfigs.debug"));
check("the DEBUG build type still uses the debug key", /debug \{\s*signingConfig signingConfigs\.debug\s*\}/.test(out));
check("the debug signing config itself is untouched", out.includes("storeFile file('debug.keystore')") && out.includes("keyAlias 'androiddebugkey'"));
check("it is idempotent: running it again changes nothing", add(out) === out);
check("a template it doesn't recognise is left alone, not mangled", add("android { }") === "android { }" && add("signingConfigs { debug { } }") === "signingConfigs { debug { } }");
check("no keystore path or password is written into the gradle text", !/storePassword '(?!android')/.test(out) && !/\.(jks|keystore)['"]\)?\s*$/m.test(out.replace("debug.keystore", "")));

// the project's real generated file, when there is one: it must already agree with the plugin
const real = path.join(__dirname, "../../android/app/build.gradle");
if (fs.existsSync(real)) {
  const text = fs.readFileSync(real, "utf8").replace(/\r\n/g, "\n");
  check("the generated android/app/build.gradle already has the signing setup the plugin produces (and re-applying changes nothing)", add(text) === text);
} else {
  console.log("SKIP generated build.gradle check: no android/ folder yet (run `npx expo prebuild`)");
}

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
check("the plugin is registered in app.json so `expo prebuild` applies it", appJson.expo.plugins.includes("./plugins/with-release-signing"));
const gitignore = fs.readFileSync(path.join(__dirname, "../../.gitignore"), "utf8");
check("keystores are git-ignored so one can never be committed by accident", /\*\.jks/.test(gitignore) && /\*\.keystore/.test(gitignore));

finish();
