/**
 * The app's real RPC client (src/lib/seeker.ts) talking to the web repo's real proxy route (POST /api/solana/rpc), with the
 * network between them simulated. Proves: signed-out calls go direct, signed-in calls go through the proxy with the user's token,
 * a real refusal (bad method, rate limit) is surfaced and never bypassed by going direct, and an unconfigured or unreachable
 * backend falls back to direct and is then left alone for a while.
 *
 * Needs the web repo next to this one (../bluvfi), or WEB_REPO pointing at it; skips cleanly without it.
 *
 *     node scripts/tests/rpc-proxy-client.test.cjs
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { ROOT, makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();

const WEB = path.resolve(process.env.WEB_REPO || path.join(ROOT, "..", "bluvfi"));
if (!fs.existsSync(path.join(WEB, "src/app/api/solana/rpc/route.ts"))) {
  console.log(`SKIP  the web repo isn't at ${WEB} (set WEB_REPO to its folder)`);
  process.exit(0);
}

(async () => {
  // ── server side: the web repo's real route and proxy, with Next, auth and the limiter stubbed, and a fake upstream provider
  const state = { limitOk: true, env: undefined };
  class Res { constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.headers = init.headers ?? {}; } static json(d, i) { return new Res(JSON.stringify(d), i); } }
  const webLoad = makeLoader(
    {
      "next/server": { NextResponse: Res, NextRequest: class {} },
      "@/lib/auth": { verifyAuth: async () => ({ userId: "u1" }) },
      "@/lib/auth-response": { authErrorResponse: () => Res.json({ error: "Unauthorized" }, { status: 401 }) },
      "@/lib/server-env": { getServerEnv: () => state.env },
      "@/lib/user-rate-limiter": { checkApiLimit: async () => (state.limitOk ? { allowed: true, headers: {} } : { allowed: false, reason: "Too many requests. Please slow down.", headers: {} }) },
    },
    WEB,
  );
  const route = webLoad("src/app/api/solana/rpc/route.ts");

  const upstream = http.createServer((rq, rs) => {
    const parts = [];
    rq.on("data", (c) => parts.push(c));
    rq.on("end", () => {
      const sent = JSON.parse(Buffer.concat(parts).toString());
      rs.writeHead(200, { "Content-Type": "application/json" });
      rs.end(JSON.stringify({ jsonrpc: "2.0", id: sent.id, result: { value: null } }));
    });
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const UPSTREAM = `http://127.0.0.1:${upstream.address().port}/?api-key=offline`;
  state.env = UPSTREAM;

  // ── the network between them
  const realFetch = global.fetch;
  const seen = { proxy: 0, direct: 0, lastAuth: null };
  const fetchMode = { backendDown: false };
  global.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u === "http://app.test/api/solana/rpc") {
      seen.proxy++;
      seen.lastAuth = init.headers?.Authorization ?? null;
      if (fetchMode.backendDown) throw new Error("network down");
      const r = await route.POST({ text: async () => init.body });
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => JSON.parse(r.body) };
    }
    if (u.startsWith("http://127.0.0.1")) return realFetch(url, init); // the proxy's own call to its upstream
    seen.direct++; // the app going straight to a Solana RPC
    const body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: body.id, result: { value: null } }) };
  };

  // ── the app's real client
  const appStubs = { "react-native": { Platform: { OS: "android", constants: {} } }, "@tanstack/react-query": { useQuery: () => ({}) }, "@/lib/api": { API_BASE_URL: "http://app.test" } };
  const seeker = makeLoader(appStubs)("src/lib/seeker.ts");
  const reset = () => { seen.proxy = 0; seen.direct = 0; };
  const K = "GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4";
  const q = (client = seeker) => client.rpc("getAccountInfo", [K, { encoding: "base64" }]);

  seeker.setSolanaRpcAuth(null);
  await q();
  check("signed out (no token) -> goes direct, the proxy is untouched", seen.proxy === 0 && seen.direct === 1);

  seeker.setSolanaRpcAuth(async () => "privy-token-123");
  reset();
  const r = await q();
  check("signed in, healthy proxy: answered through the proxy with no direct call", seen.proxy === 1 && seen.direct === 0 && r && "value" in r, `proxy=${seen.proxy} direct=${seen.direct}`);
  check("the user's token is sent as a Bearer header", seen.lastAuth === "Bearer privy-token-123");

  reset();
  let err = null;
  try { await seeker.rpc("sendTransaction", ["AAAA"]); } catch (e) { err = e; }
  check("a method the proxy refuses throws and does NOT fall back to going direct", !!err && seen.direct === 0, err && err.message);
  state.limitOk = false;
  err = null;
  try { await q(); } catch (e) { err = e; }
  check("a rate limit (429) throws and does NOT fall back to going direct", !!err && seen.direct === 0, err && err.message);
  state.limitOk = true;

  state.env = undefined; // the server has no RPC key yet: 501
  reset();
  const r2 = await q();
  check("an unconfigured proxy (501) falls back to direct and still answers", seen.proxy === 1 && seen.direct === 1 && r2 && "value" in r2, `proxy=${seen.proxy} direct=${seen.direct}`);
  reset();
  await q();
  await q();
  check("while it is down, later calls skip the proxy (no repeated failures)", seen.proxy === 0 && seen.direct === 2, `proxy=${seen.proxy} direct=${seen.direct}`);
  state.env = UPSTREAM;

  const fresh = makeLoader(appStubs)("src/lib/seeker.ts"); // a new client with no memory of the outage
  fresh.setSolanaRpcAuth(async () => "tok");
  fetchMode.backendDown = true;
  reset();
  const r3 = await q(fresh);
  check("an unreachable backend (network error) also falls back to direct", seen.proxy === 1 && seen.direct === 1 && r3 && "value" in r3, `proxy=${seen.proxy} direct=${seen.direct}`);

  global.fetch = realFetch;
  upstream.close();
  finish();
})().catch((e) => {
  process.stderr.write(`RPC-PROXY-CLIENT TEST CRASHED ${(e && e.stack) || e}\n`);
  process.exit(2);
});
