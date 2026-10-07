/**
 * Seeker and wallet logic: the Seeker Genesis Token check (src/lib/seeker.ts), `.skr` name lookup (src/lib/skr.ts) including the
 * on-chain account derivation, and the wallet-signature and error handling (src/lib/mwa.ts). RPC is a recorder; the signatures
 * are real ed25519.
 *
 *     node scripts/tests/seeker-and-wallet.test.cjs
 */
const crypto = require("crypto");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const web3 = require("@solana/web3.js");

(async () => {
  // ── the Seeker Genesis Token
  const GROUP = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";
  const rpcCalls = [];
  const rpcImpl = { fn: async () => ({}) };
  const seekerStubs = {
    "react-native": { Platform: { OS: "android", constants: {} } },
    "@tanstack/react-query": { useQuery: () => ({}) },
    "@/lib/api": { API_BASE_URL: "http://app.test" },
  };
  const seeker = makeLoader(seekerStubs)("src/lib/seeker.ts");
  const member = (group) => ({ extension: "tokenGroupMember", state: { group } });
  const pointer = (addr) => ({ extension: "metadataPointer", state: { metadataAddress: addr } });
  check("an SGT is a member of the SGT group AND points its metadata at it", seeker.isSgtMint([member(GROUP), pointer(GROUP)]) === true);
  check("the group mint itself is not an SGT (it isn't a member of itself)", seeker.isSgtMint([pointer(GROUP)]) === false);
  check("membership of some other group doesn't count", seeker.isSgtMint([member("OtherGroup1111111111111111111111111111111111"), pointer(GROUP)]) === false);
  check("a metadata pointer to somewhere else doesn't count", seeker.isSgtMint([member(GROUP), pointer("Elsewhere111111111111111111111111111111111")]) === false);
  check("no extensions, or none of the right ones", seeker.isSgtMint(undefined) === false && seeker.isSgtMint([]) === false && seeker.isSgtMint([{ extension: "transferFeeConfig" }]) === false);

  // findSeekerGenesisToken: only non-empty, 0-decimal accounts are checked, and the first real SGT wins
  const account = (mint, decimals, amount) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { decimals, uiAmount: amount } } } } } });
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    rpcCalls.push(body);
    let result;
    if (body.method === "getTokenAccountsByOwner") result = { value: [account("EmptyMint", 0, 0), account("TokenWithDecimals", 6, 100), account("NotSgt", 0, 1), account("TheSgt", 0, 1)] };
    else if (body.params[0] === "TheSgt") result = { value: { data: { parsed: { info: { extensions: [member(GROUP), pointer(GROUP)] } } } } };
    else result = { value: { data: { parsed: { info: { extensions: [] } } } } };
    return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: body.id, result }) };
  };
  const found = await makeLoader(seekerStubs)("src/lib/seeker.ts").findSeekerGenesisToken("Owner1111111111111111111111111111111111111");
  const inspected = rpcCalls.filter((c) => c.method === "getAccountInfo").map((c) => c.params[0]);
  check("findSeekerGenesisToken returns the SGT's mint", found === "TheSgt");
  check("...skipping empty accounts and tokens with decimals without even looking them up", !inspected.includes("EmptyMint") && !inspected.includes("TokenWithDecimals") && inspected.includes("NotSgt"));
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result: { value: [account("OnlyEmpty", 0, 0)] } }) });
  check("a wallet whose SGT account is empty (the token was moved away) has no SGT", (await makeLoader(seekerStubs)("src/lib/seeker.ts").findSeekerGenesisToken("Owner1111111111111111111111111111111111111")) === null);
  global.fetch = realFetch;

  // ── .skr names
  const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
  const rpcLog = [];
  const skrRpc = { handler: async () => ({}) };
  const skr = makeLoader({
    "react-native": { Platform: { OS: "android", constants: {} } },
    "@tanstack/react-query": { useQuery: () => ({}) },
    "expo-crypto": { digestStringAsync: async (_alg, s) => sha(s), CryptoDigestAlgorithm: { SHA256: "SHA-256" } },
    "@/lib/seeker": { rpc: async (method, params, url) => { rpcLog.push({ method, params, url }); return skrRpc.handler(method, params, url); } },
  })("src/lib/skr.ts");

  // The account an AllDomains name lives at, derived independently here from the documented scheme.
  const ANS = new web3.PublicKey("ALTNSZ46uaAUU7XUV6awvdorLGqAsPwa9shm7h4uP2FK");
  const ROOT = new web3.PublicKey("3mX9b4AZaQehNoQGfckVcmgmA6bkBoFcbLj9RMmMyNcU");
  const hash = (s) => Uint8Array.from(Buffer.from(sha("ALT Name Service" + s), "hex"));
  const ZERO = new Uint8Array(32);
  const pda = (seeds) => web3.PublicKey.findProgramAddressSync(seeds, ANS)[0];
  const parent = pda([hash(".skr"), ZERO, ROOT.toBytes()]);
  check("alice.skr lives at the account the AllDomains scheme says", (await skr.skrNameAccount("alice")).toBase58() === pda([hash("alice"), ZERO, parent.toBytes()]).toBase58());
  check("different names live at different accounts", (await skr.skrNameAccount("alice")).toBase58() !== (await skr.skrNameAccount("bob")).toBase58());

  const owner = web3.Keypair.generate().publicKey.toBase58();
  const expiry = (seconds) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(seconds)); return [b.toString("base64"), "base64"]; };
  const nameAccount = (seconds) => ({ pubkey: web3.Keypair.generate().publicKey.toBase58(), account: { data: expiry(seconds) } });
  const reverse = (label) => { const b = Buffer.alloc(200 + label.length + 4); Buffer.from(label).copy(b, 200); return { data: [b.toString("base64"), "base64"] }; };
  const future = Math.floor(Date.now() / 1000) + 86_400;
  const past = Math.floor(Date.now() / 1000) - 86_400;
  skrRpc.handler = async (method, params) => {
    if (method === "getProgramAccounts") return [nameAccount(future), nameAccount(past), nameAccount(0), nameAccount(future)];
    if (method === "getMultipleAccounts") {
      // one reverse record per live name, in order: zoe, an invalid label, alice
      const labels = ["zoe", "Bad Label!", "alice"];
      return { value: params[0].map((_, i) => reverse(labels[i])) };
    }
    throw new Error("unexpected " + method);
  };
  const names = await skr.resolveSkrNames(owner);
  check("names are the owner's live names: expired ones dropped, 'never expires' (0) kept, bad labels ignored, sorted", names.join() === "alice.skr,zoe.skr", names.join());
  const gpa = rpcLog.find((c) => c.method === "getProgramAccounts");
  check("it asks only for accounts under .skr owned by this wallet, and only fetches the expiry field", gpa.params[1].filters.some((f) => f.memcmp.offset === 8 && f.memcmp.bytes === parent.toBase58()) && gpa.params[1].filters.some((f) => f.memcmp.offset === 40 && f.memcmp.bytes === owner) && gpa.params[1].dataSlice.length === 8);
  check("an invalid address has no names and makes no request", (rpcLog.length = 0, (await skr.resolveSkrNames("not-an-address")).length === 0 && rpcLog.length === 0));
  skrRpc.handler = async (method, params, url) => { if (url === undefined) throw new Error("rate limited"); return method === "getProgramAccounts" ? [] : { value: [] }; };
  rpcLog.length = 0;
  check("when the usual RPC refuses (rate limit), it retries on the public mainnet endpoint", (await skr.resolveSkrNames(owner)).length === 0 && rpcLog.some((c) => c.url === "https://api.mainnet-beta.solana.com"));
  // more than 100 names are looked up in batches of 100
  skrRpc.handler = async (method, params) => (method === "getProgramAccounts" ? Array.from({ length: 230 }, () => nameAccount(0)) : { value: params[0].map((_, i) => reverse(`n${i}`)) });
  rpcLog.length = 0;
  const many = await skr.resolveSkrNames(owner);
  const batches = rpcLog.filter((c) => c.method === "getMultipleAccounts").map((c) => c.params[0].length);
  check("230 names are looked up in batches of at most 100", batches.join() === "100,100,30" && many.length === 230, batches.join());

  // ── wallet signatures and errors
  const mwa = makeLoader({ "react-native": { Platform: { OS: "ios" } }, "@/lib/seeker": { isSeekerDevice: () => false } })("src/lib/mwa.ts");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const message = new TextEncoder().encode("bluvfi.xyz wants you to sign in with your Solana account:\n7xKp...9fQa\n\nNonce: abc123");
  const sig = new Uint8Array(crypto.sign(null, Buffer.from(message), privateKey));
  const verifies = (s) => crypto.verify(null, Buffer.from(message), publicKey, Buffer.from(s));
  check("a wallet that returns just the signature: used as is", verifies(mwa.extractSignature(sig, message)));
  check("a wallet that returns message || signature: the signature is cut out and still verifies", verifies(mwa.extractSignature(new Uint8Array([...message, ...sig]), message)));
  check("an unknown longer layout: the last 64 bytes are taken, by convention", verifies(mwa.extractSignature(new Uint8Array([9, 9, 9, ...sig]), message)));
  let thrown = null;
  try { mwa.extractSignature(new Uint8Array(10), message); } catch (e) { thrown = e; }
  check("something shorter than a signature is refused with a plain message", thrown && thrown.kind === "failed" && /unexpected signature/.test(thrown.message));

  const f = mwa.friendlyWalletError;
  check("no wallet installed -> 'not-found' with install advice", f({ code: "ERROR_WALLET_NOT_FOUND" }).kind === "not-found" && /Install Phantom or Solflare/.test(f(new Error("found no installed wallet")).message));
  check("the person cancelling -> 'declined' (so it isn't shown as an error)", f({ code: -1 }).kind === "declined" && f(new Error("User declined the request")).kind === "declined" && f({ code: "ERROR_ASSOCIATION_CANCELLED" }).kind === "declined");
  check("a timeout asks them to open the wallet again", f({ code: "ERROR_SESSION_TIMEOUT" }).kind === "failed" && /too long/.test(f({ code: "ERROR_SESSION_TIMEOUT" }).message));
  check("not enough balance passes the wallet's own first line through", f(new Error("Insufficient funds for fee\nstack...")).message === "Insufficient funds for fee");
  check("anything else gets a generic, safe message (never a stack trace)", /Couldn't talk to your wallet/.test(f(new Error("kaboom: internal detail")).message) && !f(new Error("kaboom: internal detail")).message.includes("kaboom"));
  const already = f({ code: -1 });
  check("an already-friendly error is returned unchanged", f(already) === already);

  finish();
})().catch((e) => {
  global.fetch = undefined;
  process.stderr.write(`SEEKER-AND-WALLET TEST CRASHED ${(e && e.stack) || e}\n`);
  process.exit(2);
});
