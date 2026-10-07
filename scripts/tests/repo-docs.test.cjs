/**
 * The repository has to be something "someone else can clone and run": a real README whose instructions and file paths are true, and an
 * .env.example that lists every setting the code reads and holds no credentials. Source checks only.
 *
 *     node scripts/tests/repo-docs.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { reporter } = require("./_harness.cjs");
const { check, finish } = reporter();

const root = path.join(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const readme = read("README.md");
const example = read(".env.example");
const pkg = JSON.parse(read("package.json"));

// ── .env.example
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(path.join(root, "src"));
const used = new Set();
for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g)) used.add(m[1]);
const missing = [...used].filter((n) => !example.includes(n));
check("every EXPO_PUBLIC_ setting the code reads is listed in .env.example", used.size >= 8 && missing.length === 0, missing.join(", "));
check("the setting the app needs to reach its backend is documented, with the production default", example.includes("EXPO_PUBLIC_API_BASE_URL=https://www.bluvfi.xyz"));
const settings = example.split("\n").filter((l) => !l.startsWith("#")).join("\n"); // comments may say that secrets are NOT here
check(".env.example's settings hold no database URL, private key, secret or token", !/postgres(ql)?:\/\/|RACE_DATABASE_URL|PRIVATE KEY|secret|sk_(live|test)_|neondb|aiven/i.test(settings));
check("the Alchemy key is a placeholder, not a real key", /EXPO_PUBLIC_ALCHEMY_API_KEY=your_alchemy_api_key/.test(example));
const ignored = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
check(".env is git-ignored but .env.example is not, so a clone gets the example and nobody commits real values", /^\.env$/m.test(ignored) && !/^\.env\.example$/m.test(ignored) && !/^\.env\*$/m.test(ignored));

// ── README
check("the README is the project's own, not the Expo starter template", !/create-expo-app|reset-project|Welcome to your Expo app/.test(readme) && readme.includes("Clock In") && readme.includes("Mobile Wallet Adapter"));
check("the README gives the clone-and-run steps, and they are real commands", readme.includes("npm install") && readme.includes("cp .env.example .env") && readme.includes("npx expo run:android") && pkg.scripts.android === "expo run:android");
check("the README's test command exists", readme.includes("npm test") && pkg.scripts.test === "node scripts/tests/run-all.cjs");
check("the README says what is new for the hackathon, that the app needs the backend, and what is not instant or not in the app", /What's new for the hackathon/.test(readme) && /Backend/.test(readme) && /requests the Bluvfi team reviews/.test(readme) && /Coming soon/.test(readme));
check("the README explains the release build and keeps keystores out of the repo", readme.includes("assembleRelease") && readme.includes("BLUVFI_STORE_FILE") && readme.includes("never in the repo"));

const paths = [...new Set([...readme.matchAll(/`((?:src|plugins|scripts)\/[A-Za-z0-9_./()\[\]-]+?)`/g)].map((m) => m[1].replace(/[.,]$/, "")))];
const gone = paths.filter((p) => !fs.existsSync(path.join(root, p.replace(/\/$/, ""))));
check("every file or folder the README points to exists", paths.length >= 12 && gone.length === 0, gone.join(", "));
const globbed = ["src/lib/skr-*.ts"].every((g) => fs.readdirSync(path.join(root, "src/lib")).some((f) => /^skr-.*\.ts$/.test(f)));
check("the SKR files the README describes exist", globbed);

finish();
