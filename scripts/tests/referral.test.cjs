/**
 * Referral codes (src/lib/referral.ts): reading a code out of whatever a person types or pastes, keeping a code on the phone until
 * there is an account, and what happens to it once it is sent to the server.
 *
 *     node scripts/tests/referral.test.cjs
 */
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();

const store = new Map();
const storage = { broken: false };
const SecureStore = {
  getItemAsync: async (k) => { if (storage.broken) throw new Error("storage unavailable"); return store.get(k) ?? null; },
  setItemAsync: async (k, v) => { if (storage.broken) throw new Error("storage unavailable"); store.set(k, v); },
  deleteItemAsync: async (k) => { if (storage.broken) throw new Error("storage unavailable"); store.delete(k); },
};
const load = makeLoader({ "expo-secure-store": SecureStore, "@/lib/device": { getDeviceId: async () => null } });
const { ApiError } = load("src/lib/api.ts");
const ref = load("src/lib/referral.ts");

(async () => {
  const n = ref.normalizeReferralCode;
  check("a plain code is accepted", n("ABCD2345") === "ABCD2345");
  check("lowercase, spaces and dashes are tidied up", n("abcd2345") === "ABCD2345" && n("  abcd 2345 ") === "ABCD2345" && n("ABCD-2345") === "ABCD2345");
  check("a pasted web link gives the code", n("https://www.bluvfi.xyz/r/abcd2345") === "ABCD2345" && n("https://www.bluvfi.xyz/r/ABCD2345?utm=x") === "ABCD2345");
  check("a pasted app link gives the code", n("bluvfi://ref/ABCD2345") === "ABCD2345");
  check("the wrong length is refused", n("ABCD234") === null && n("ABCD23456") === null && n("") === null);
  check("characters the server never issues (0, O, 1, I, L) are refused", ["ABCD2340", "ABCD234O", "ABCD2341", "ABCD234I", "ABCD234L"].every((c) => n(c) === null));
  check("null and undefined are refused", n(null) === null && n(undefined) === null);

  check("the share link is the web page for the code", ref.referralLink("ABCD2345") === "https://www.bluvfi.xyz/r/ABCD2345");
  const msg = ref.referralMessage("ABCD2345");
  check("the share message carries both the code and the link (in case the link doesn't open the app)", msg.includes("ABCD2345") && msg.includes("https://www.bluvfi.xyz/r/ABCD2345"));

  // ── keeping a code until there is an account
  check("nothing saved yet", (await ref.getPendingReferral()) === null);
  await ref.setPendingReferral("ABCD2345");
  check("a saved code is read back", (await ref.getPendingReferral()) === "ABCD2345");
  await ref.clearPendingReferral();
  check("clearing removes it", (await ref.getPendingReferral()) === null);
  store.set("bluvfi_pending_referral", "garbage!!");
  check("something invalid in storage is ignored, not trusted", (await ref.getPendingReferral()) === null);
  store.clear();
  storage.broken = true;
  let threw = false;
  try { await ref.setPendingReferral("ABCD2345"); await ref.clearPendingReferral(); await ref.getPendingReferral(); } catch { threw = true; }
  check("a storage failure never throws (the person can enter the code again later)", threw === false && (await ref.getPendingReferral()) === null);
  storage.broken = false;

  // ── sending it once signed in
  const calls = [];
  const callWith = (impl) => async (path, options) => { calls.push({ path, options }); return impl(); };
  check("no saved code -> nothing to do and no request", (await ref.applyPendingReferral(callWith(async () => ({ ok: true })))) === "none" && calls.length === 0);

  await ref.setPendingReferral("ABCD2345");
  let outcome = await ref.applyPendingReferral(callWith(async () => ({ ok: true })));
  check("it posts the code to /api/shar/referral", calls[0].path === "/api/shar/referral" && calls[0].options.method === "POST" && calls[0].options.body.code === "ABCD2345");
  check("applied: reported, and the saved code is cleared so it is never sent twice", outcome === "applied" && (await ref.getPendingReferral()) === null);

  const failing = async (err, label, expected, kept) => {
    store.clear();
    await ref.setPendingReferral("ABCD2345");
    const got = await ref.applyPendingReferral(callWith(async () => { throw err; }));
    const stillSaved = (await ref.getPendingReferral()) === "ABCD2345";
    check(`${label}: ${expected}, code ${kept ? "kept for the next try" : "cleared"}`, got === expected && stillSaved === kept, `${got} saved=${stillSaved}`);
  };
  await failing(new ApiError(409, "You've already used a referral code."), "already used a code (409)", "already", false);
  await failing(new ApiError(404, "That code isn't valid."), "unknown code (404)", "rejected", false);
  await failing(new ApiError(400, "You can't use your own code."), "own code or same phone (400)", "rejected", false);
  await failing(new ApiError(500, "Couldn't save that code."), "server error (500)", "retry", true);
  await failing(new ApiError(503, "Referrals are being set up."), "not set up yet (503)", "retry", true);
  await failing(new ApiError(429, "Too many requests."), "rate limited (429)", "retry", true);
  await failing(new TypeError("Network request failed"), "no network", "retry", true);

  finish();
})().catch((e) => {
  process.stderr.write(`REFERRAL TEST CRASHED ${(e && e.stack) || e}\n`);
  process.exit(2);
});
