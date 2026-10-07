/**
 * The phone id and the API client (src/lib/device.ts, src/lib/api.ts): which id is used, that it is stable and never blocks a
 * request, and what every API call sends and how errors come back.
 *
 *     node scripts/tests/device-and-api.test.cjs
 */
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();

// ── the device id
function world({ androidId = "abcdef0123456789", broken = false, store = new Map(), appModule = true } = {}) {
  let uuids = 0;
  const SecureStore = {
    getItemAsync: async (k) => { if (broken) throw new Error("storage unavailable"); return store.get(k) ?? null; },
    setItemAsync: async (k, v) => { if (broken) throw new Error("storage unavailable"); store.set(k, v); },
  };
  const stubs = { "expo-secure-store": SecureStore, "expo-crypto": { randomUUID: () => `uuid-${++uuids}` } };
  if (appModule) stubs["expo-application"] = { getAndroidId: () => androidId };
  else Object.defineProperty(stubs, "expo-application", { get() { throw new Error("native module missing"); }, enumerable: true });
  const load = makeLoader(stubs);
  return { load, store, device: load("src/lib/device.ts") };
}

(async () => {
  let w = world();
  check("the Android ID is preferred, tagged so it can't clash with other kinds of id", (await w.device.getDeviceId()) === "android:abcdef0123456789");
  check("...and nothing is written to storage in that case", w.store.size === 0);
  w = world({ androidId: "" });
  const generated = await w.device.getDeviceId();
  check("no usable Android ID -> a random install id is generated and kept", /^install:uuid-1$/.test(generated) && w.store.get("bluvfi_install_id") === generated);
  check("a short Android ID is treated as unusable", (await world({ androidId: "short" }).device.getDeviceId()).startsWith("install:"));
  check("the same id is returned on every call", (await w.device.getDeviceId()) === generated);
  const again = world({ androidId: "", store: w.store });
  check("a new session with the same storage gets the same install id back", (await again.device.getDeviceId()) === generated);
  const noModule = world({ appModule: false });
  check("a build without the native module still works (falls back to the install id)", (await noModule.device.getDeviceId()).startsWith("install:"));
  const broken = world({ androidId: "", broken: true });
  check("if storage fails there is simply no id: it never throws or blocks a request", (await broken.device.getDeviceId()) === null);

  // ── the API client
  process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.test/"; // trailing slash on purpose
  const sent = [];
  const realFetch = global.fetch;
  const reply = { status: 200, body: { ok: true } };
  global.fetch = async (url, init) => {
    sent.push({ url: String(url), init });
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => { if (reply.body === undefined) throw new Error("not json"); return reply.body; } };
  };
  const apiWorld = (deviceId) => makeLoader({ "@/lib/device": { getDeviceId: async () => deviceId } })("src/lib/api.ts");
  let api = apiWorld("android:abcdef0123456789");

  await api.apiRequest("/api/shar", { token: "tok123", query: { q: "weather", skip: undefined, free: 1 } });
  const first = sent[0];
  check("the base URL's trailing slash is trimmed and the query string is built (undefined values left out)", first.url === "https://api.test/api/shar?q=weather&free=1", first.url);
  check("every request carries the Privy token as a Bearer header", first.init.headers.Authorization === "Bearer tok123");
  check("every request carries the phone id (X-Bluvfi-Device)", first.init.headers["X-Bluvfi-Device"] === "android:abcdef0123456789");
  check("a GET sends no body and JSON content type", first.init.method === "GET" && first.init.body === undefined && first.init.headers["Content-Type"] === "application/json");
  await api.apiRequest("/api/x", { method: "POST", body: { a: 1 } });
  check("a POST sends the body as JSON, and no Authorization when signed out", sent[1].init.body === '{"a":1}' && sent[1].init.headers.Authorization === undefined);
  api = apiWorld(null);
  await api.apiRequest("/api/x", { token: "t" });
  check("with no phone id the header is simply left out (the request still goes)", sent[2].init.headers["X-Bluvfi-Device"] === undefined);

  reply.status = 409; reply.body = { error: "You already have a claim in progress." };
  let err = null;
  try { await api.apiRequest("/api/shar/claim", { method: "POST", body: {} }); } catch (e) { err = e; }
  check("an error response becomes an ApiError with the server's message and status", err && err.name === "ApiError" && err.status === 409 && err.message === "You already have a claim in progress.");
  reply.status = 502; reply.body = undefined;
  err = null;
  try { await api.apiRequest("/api/x"); } catch (e) { err = e; }
  check("an error page that isn't JSON still gives a readable ApiError", err && err.status === 502 && err.message === "Request failed (502)");
  reply.status = 204; reply.body = undefined;
  check("204 No Content returns nothing", (await api.apiRequest("/api/x", { method: "DELETE" })) === undefined);
  reply.status = 200; reply.body = { providers: [] };
  check("a normal response is returned as JSON", JSON.stringify(await api.apiRequest("/api/network/providers")) === '{"providers":[]}');

  global.fetch = realFetch;
  finish();
})().catch((e) => {
  process.stderr.write(`DEVICE-AND-API TEST CRASHED ${(e && e.stack) || e}\n`);
  process.exit(2);
});
