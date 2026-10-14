/**
 * Shared harness for the app's logic tests. Runs the REAL TypeScript in src/ (transpiled on the fly) with the React Native and
 * Expo native pieces replaced by stubs, so the pure logic (referral codes, the API client, the device id, money formatting, SKR
 * names, wallet signatures...) can be tested with plain Node. No emulator, no network, nothing to install.
 *
 *   • "@/..." and relative imports resolve to the real source files.
 *   • Anything else must be stubbed by the test (an unstubbed import is an error, so a test never silently
 *     runs against a real native module). A few pure packages are allowed through: buffer, @solana/web3.js, viem, node:crypto.
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "../..");
const ts = require(path.join(ROOT, "node_modules", "typescript"));

const PASS_THROUGH = {
  buffer: () => require(path.join(ROOT, "node_modules", "buffer")),
  "@solana/web3.js": () => require(path.join(ROOT, "node_modules", "@solana/web3.js")),
  "@solana/spl-token": () => require(path.join(ROOT, "node_modules", "@solana/spl-token")),
  "node:crypto": () => require("node:crypto"),
  // The chain definitions (arc-chain.ts, swap-chains.ts) are plain viem data.
  viem: () => require(path.join(ROOT, "node_modules", "viem")),
  "viem/chains": () => require(path.join(ROOT, "node_modules", "viem", "chains")),
};

function compile(file) {
  return ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

function resolveFile(base) {
  for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) if (fs.existsSync(cand)) return cand;
  return null;
}

/**
 * A loader with its own module cache. `stubs` maps an import name, exactly as written in the source, to the module to use.
 * `root` lets a test load another project's source too (the web repo, for cross-repo tests).
 */
function makeLoader(stubs = {}, root = ROOT) {
  const cache = new Map();
  const load = (file) => {
    const abs = path.isAbsolute(file) ? file : path.join(root, file);
    if (cache.has(abs)) return cache.get(abs).exports;
    const mod = { exports: {} };
    cache.set(abs, mod);
    new Function("module", "exports", "require", compile(abs))(mod, mod.exports, (name) => {
      if (name in stubs) return stubs[name];
      if (name.startsWith("@/")) {
        const found = resolveFile(path.join(root, "src", name.slice(2)));
        if (!found) throw new Error(`cannot resolve ${name} (from ${path.relative(root, abs)})`);
        return load(found);
      }
      if (name.startsWith(".")) {
        const found = resolveFile(path.resolve(path.dirname(abs), name));
        if (!found) throw new Error(`cannot resolve ${name} (from ${path.relative(root, abs)})`);
        return load(found);
      }
      if (name in PASS_THROUGH) return PASS_THROUGH[name]();
      throw new Error(`unstubbed import "${name}" in ${path.relative(root, abs)}`);
    });
    return mod.exports;
  };
  return load;
}

function reporter() {
  let pass = 0;
  let fail = 0;
  return {
    check(name, ok, detail = "") {
      ok ? pass++ : fail++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  -> ${detail}` : ""}`);
    },
    finish() {
      console.log(`\n${pass} passed, ${fail} failed`);
      process.exit(fail ? 1 : 0);
    },
  };
}

module.exports = { ROOT, makeLoader, reporter };
