/**
 * Live check of `.skr` name lookup (src/lib/skr.ts) against Solana mainnet: probes likely names, finds real owners, and checks the
 * reverse lookup returns the name that was found. Read-only. Needs internet; the lookup uses getProgramAccounts, which free RPC
 * plans often refuse, so set SOLANA_RPC_URL to a plan that allows it if the public endpoint rate-limits you.
 *
 *     node scripts/live/skr-names.live.cjs
 */
const crypto = require("crypto");
const web3 = require("@solana/web3.js");
const { makeLoader, reporter } = require("../tests/_harness.cjs");
const { check, finish } = reporter();

const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
async function rpc(method, params) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const json = await res.json();
    if (json.error && /exceeded|429|rate/i.test(json.error.message)) {
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
      continue;
    }
    if (json.error) throw new Error(`${method}: ${json.error.message}`);
    return json.result;
  }
  throw new Error(`${method}: still rate limited after retries`);
}

const { resolveSkrNames, skrNameAccount } = makeLoader({
  "react-native": { Platform: { OS: "android", constants: {} } },
  "@tanstack/react-query": { useQuery: () => ({}) },
  "expo-crypto": { CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digestStringAsync: async (_a, s) => crypto.createHash("sha256").update(s, "utf8").digest("hex") },
  "@/lib/seeker": { rpc },
})("src/lib/skr.ts");

(async () => {
  const probes = ["alice", "bob", "solana", "seeker", "mobile", "toly", "sol", "skr", "test", "crypto", "wallet", "web3", "satoshi"];
  const found = [];
  for (const label of probes) {
    const account = await skrNameAccount(label);
    const info = await rpc("getAccountInfo", [account.toBase58(), { encoding: "base64" }]);
    if (!info.value) continue;
    const data = Buffer.from(info.value.data[0], "base64");
    const expiresAt = Number(data.readBigUInt64LE(104));
    if (expiresAt !== 0 && expiresAt * 1000 < Date.now()) continue; // expired
    found.push({ label, owner: new web3.PublicKey(data.subarray(40, 72)).toBase58() });
  }
  console.log(`registered names found: ${found.map((f) => f.label).join(", ") || "none"}`);
  check("at least one real .skr name was found to test with", found.length > 0);
  let verified = 0;
  for (const f of found.slice(0, 4)) {
    const names = await resolveSkrNames(f.owner);
    if (names.includes(`${f.label}.skr`)) verified++;
  }
  check("the reverse lookup returns the name for owners that hold it directly", found.length === 0 || verified > 0, `${verified} round trip(s)`);
  check("a wallet with no .skr name has none", (await resolveSkrNames("GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4")).length === 0);
  check("an invalid address has none, with no error", (await resolveSkrNames("not-an-address")).length === 0);
  finish();
})().catch((e) => {
  console.error(`LIVE CHECK FAILED: ${e.message}`);
  process.exit(1);
});
