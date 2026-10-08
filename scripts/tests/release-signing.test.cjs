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
  check("and its guard accepts Android Studio's signing wizard", text.includes("!project.hasProperty('android.injected.signing.store.file')"));
} else {
  console.log("SKIP generated build.gradle check: no android/ folder yet (run `npx expo prebuild`)");
}

// the guard that refuses a debug-signed release
check("a guard refuses a release build that has no keystore, and only for release tasks", out.includes("refuse to produce a release signed with the debug key") && out.includes("throw new GradleException(") && out.includes("(assemble|bundle|package)Release"));
check("the guard lets a build through when the BLUVFI_ keystore is set, when Android Studio's signing wizard supplies one, or when a throwaway build is asked for", ["'BLUVFI_STORE_FILE'", "'android.injected.signing.store.file'", "'ALLOW_DEBUG_SIGNED_RELEASE'"].every((p) => out.includes(`!project.hasProperty(${p})`)));
const OLD = out.replace("!project.hasProperty('android.injected.signing.store.file') && ", "");
check("an older guard (one that didn't know about the Studio wizard) is upgraded in place, and only once", !OLD.includes("android.injected") && add(OLD).includes("!project.hasProperty('android.injected.signing.store.file')") && add(add(OLD)) === add(OLD) && add(OLD).split("refuse to produce").length === 2);
check("the guard is added after the signing config only (an unrecognised template gets neither)", add("android { }") === "android { }");

// the helper that writes the key details into the user-level gradle.properties
const setup = fs.readFileSync(path.join(__dirname, "../setup-release-signing.ps1"), "utf8");
check("the setup script prompts for the passwords masked, checks them with keytool, and writes only the four BLUVFI_ settings", setup.includes("-AsSecureString") && setup.includes("keytool") && ["BLUVFI_STORE_FILE", "BLUVFI_STORE_PASSWORD", "BLUVFI_KEY_ALIAS", "BLUVFI_KEY_PASSWORD"].every((k) => setup.includes(k)));
check("the setup script keeps the keystore outside the repo and has no password, alias or path of a real key in it", setup.includes("'.bluvfi'") && !/(storepass|keypass|Password)\s*[=:]\s*['"][^'"$]+['"]/i.test(setup.replace(/BLUVFI_\w+_PASSWORD/g, "")));
check("the setup script passes passwords to keytool through the environment, not the command line", setup.includes("-storepass:env") && setup.includes("-keypass:env") && !/-storepass\s+\$/.test(setup));
check("the README points to the setup script", fs.readFileSync(path.join(__dirname, "../../README.md"), "utf8").includes("scripts\\setup-release-signing.ps1"));

// the app id is shared with the existing Capacitor app, so the new build must carry a HIGHER version to install over it
const aj = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
check("app.json carries the Android versionCode and version (not left to the generated android/ folder, which is not in git)", aj.expo.android.versionCode === 600 && aj.expo.version === "6.0.0");
const oldApp = path.join(__dirname, "../../../bluvfi/android/app/build.gradle");
if (fs.existsSync(oldApp)) {
  const old = Number(/versionCode\s+(\d+)/.exec(fs.readFileSync(oldApp, "utf8"))?.[1]);
  check("it is higher than the existing Capacitor app's versionCode, so it can install over it and be uploaded as an update", old > 0 && aj.expo.android.versionCode > old, `new ${aj.expo.android.versionCode} vs old ${old}`);
} else {
  console.log("SKIP version-vs-old-app check: the web repo isn't next to this one");
}
if (fs.existsSync(real)) {
  const g = fs.readFileSync(real, "utf8");
  check("the generated build.gradle agrees with app.json (so a rebuild keeps the same version)", new RegExp(`versionCode ${aj.expo.android.versionCode}\\b`).test(g) && g.includes(`versionName "${aj.expo.version}"`));
}

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
check("the plugin is registered in app.json so `expo prebuild` applies it", appJson.expo.plugins.includes("./plugins/with-release-signing"));
const gitignore = fs.readFileSync(path.join(__dirname, "../../.gitignore"), "utf8");
check("keystores are git-ignored so one can never be committed by accident", /\*\.jks/.test(gitignore) && /\*\.keystore/.test(gitignore));

finish();
