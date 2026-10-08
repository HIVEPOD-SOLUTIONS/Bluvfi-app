/**
 * The Shar, network, credits and admin data layer (src/hooks/use-shar.ts): money formatting, and the exact request each hook
 * makes (path, method, body, what it refreshes), with react-query and the API client replaced by recorders.
 *
 *     node scripts/tests/shar-hooks.test.cjs
 */
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();

const calls = [];
const invalidated = [];
const fakeCall = async (path, options = {}) => { calls.push({ path, ...options }); return { ok: true }; };
const hooks = makeLoader({
  "@tanstack/react-query": {
    keepPreviousData: "KEEP_PREVIOUS",
    useInfiniteQuery: (options) => options,
    useQuery: (options) => options,
    useMutation: (options) => options, // hand the options back so the test can run mutationFn / onSuccess itself
    useQueryClient: () => ({ invalidateQueries: (arg) => invalidated.push(arg.queryKey) }),
  },
  "@/lib/api": { ApiError: class ApiError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } } },
  "./use-api": { useApiClient: () => fakeCall, useApiQuery: (key, path, params, options) => ({ key, path, params, options }) },
})("src/hooks/use-shar.ts");

(async () => {
  // ── money, as dollars
  const m = hooks.microToUsd;
  check("microToUsd: whole and fractional amounts", m(50_000) === "$0.05" && m(100_000) === "$0.10" && m(1_000_000) === "$1.00" && m(1_234_500_000) === "$1,234.50");
  check("microToUsd: zero, a single micro-dollar, and tiny amounts keep their digits", m(0) === "$0.00" && m(1) === "$0.000001" && m(12_345) === "$0.012345");
  check("microToUsd: negatives (a debit) keep the sign", m(-20_000) === "-$0.02" && m(-1_500_000) === "-$1.50");
  check("microToUsd: never shows float noise", m(0.1 * 3 * 1_000_000) === "$0.30");
  const p = hooks.priceUsd;
  check("priceUsd: a provider's price is shown as dollars ('0.1' is $0.10, never $0.1)", p("0.1") === "$0.10" && p("0.05") === "$0.05" && p("5") === "$5.00" && p("0.005") === "$0.005" && p("0") === "$0.00");

  // ── browsing the network
  check("browse defaults: nothing filtered, featured first", JSON.stringify(hooks.DEFAULT_BROWSE) === '{"q":"","category":null,"sort":"featured","free":false}');
  const q0 = hooks.useNetworkProviders();
  check("browse: the default request sends no filters", q0.path === "/api/network/providers" && Object.values(q0.params).every((v) => v === undefined));
  const q1 = hooks.useNetworkProviders({ q: "  weather ", category: "data", sort: "popular", free: true });
  check("browse: search (trimmed), category, sort and free are sent", q1.params.q === "weather" && q1.params.category === "data" && q1.params.sort === "popular" && q1.params.free === 1);
  check("browse: 'featured' is the default sort so it isn't sent", hooks.useNetworkProviders({ ...hooks.DEFAULT_BROWSE, sort: "featured" }).params.sort === undefined);
  check("browse: results are cached per search, and the old list stays on screen while a new one loads", JSON.stringify(q1.key) === JSON.stringify(["network", "providers", "weather", "data", "popular", true]) && q1.options.placeholderData === "KEEP_PREVIOUS");
  const detail = hooks.useProvider("abc");
  check("provider page: loads /api/network/providers/:id, and not at all without an id", detail.path === "/api/network/providers/abc" && detail.options.enabled === true && hooks.useProvider(undefined).options.enabled === false);

  // ── owner actions
  let opts = hooks.useUpdateProvider();
  await opts.mutationFn({ id: "p1", changes: { priceUsdc: "0.10", exampleRequest: null } });
  check("edit: PATCH the provider with just the changes", calls.at(-1).path === "/api/network/providers/p1" && calls.at(-1).method === "PATCH" && calls.at(-1).body.priceUsdc === "0.10" && calls.at(-1).body.exampleRequest === null);
  opts.onSuccess();
  check("edit: refreshes everything about the network", JSON.stringify(invalidated.at(-1)) === '["network"]');
  opts = hooks.useProviderAction();
  await opts.mutationFn({ id: "p1", action: "pause" });
  check("pause / resume: PATCH with just the action", calls.at(-1).method === "PATCH" && JSON.stringify(calls.at(-1).body) === '{"action":"pause"}');
  opts = hooks.useDeleteProvider();
  await opts.mutationFn("p1");
  check("remove: DELETE the provider", calls.at(-1).path === "/api/network/providers/p1" && calls.at(-1).method === "DELETE");
  opts = hooks.useSubmitProvider();
  await opts.mutationFn({ name: "N", summary: "S", category: "data", endpointUrl: "https://x.example.com", payoutWallet: "W", exampleRequest: '{"a":1}' });
  check("add: POST includes the example request", calls.at(-1).path === "/api/network/providers" && calls.at(-1).method === "POST" && calls.at(-1).body.exampleRequest === '{"a":1}');

  // ── trying a provider
  opts = hooks.useTryProvider();
  await opts.mutationFn({ id: "p1", body: { city: "Lagos" } });
  check("try it: POST /call with the request the person edited", calls.at(-1).path === "/api/network/providers/p1/call" && calls.at(-1).body.city === "Lagos");
  await opts.mutationFn({ id: "p1" });
  check("try it: with no body it sends an empty object (never nothing)", JSON.stringify(calls.at(-1).body) === "{}");
  opts.onSuccess();
  check("try it: refreshes the network, the credits balance and the activity list", invalidated.slice(-3).map((k) => k[0]).join() === "network,credits,activity");

  // ── activity
  const act = hooks.useActivity("shar");
  await act.queryFn({ pageParam: "2026-10-05 10:00:00.000000|abc" });
  check("activity: GET /api/activity/feed with the source, a page size and the cursor", calls.at(-1).path === "/api/activity/feed" && calls.at(-1).query.source === "shar" && calls.at(-1).query.limit === 25 && calls.at(-1).query.cursor === "2026-10-05 10:00:00.000000|abc");
  await hooks.useActivity().queryFn({ pageParam: undefined });
  check("activity: 'all' sends no source filter, and the first page sends no cursor", calls.at(-1).query.source === undefined && calls.at(-1).query.cursor === undefined);
  check("activity: cached per source, the next page follows the server's cursor, and the end of history stops", JSON.stringify(act.queryKey) === '["activity","shar"]' && act.getNextPageParam({ nextCursor: "c1" }) === "c1" && act.getNextPageParam({ nextCursor: null }) === undefined);
  for (const [name, make, arg] of [["claim", () => hooks.useClaimShar?.(), { wallet: "W" }], ["add credits", () => hooks.useTopup(), "sig"], ["withdraw", () => hooks.useWithdraw(), "W"]]) {
    const o = make();
    if (!o) continue;
    invalidated.length = 0;
    o.onSuccess();
    check(`activity: a successful ${name} refreshes the list`, invalidated.some((k) => k[0] === "activity"));
  }

  // ── admin and money
  opts = hooks.usePayoutAction();
  await opts.mutationFn({ kind: "commission", id: "c1", action: "pay", expectedSkrMicro: 511_360_000, acknowledgeRisk: true });
  check("pay: sends the reviewed amount and the risk acknowledgement", calls.at(-1).path === "/api/admin/payouts/commission/c1" && calls.at(-1).body.expectedSkrMicro === 511_360_000 && calls.at(-1).body.acknowledgeRisk === true && calls.at(-1).body.action === "pay");
  await opts.mutationFn({ kind: "shar_claim", id: "s1", action: "pay" });
  check("pay: without a flag, nothing is acknowledged", calls.at(-1).body.acknowledgeRisk === undefined);
  opts = hooks.useReviewListing();
  await opts.mutationFn({ id: "p1", action: "feature" });
  check("review: feature / unfeature go through the review endpoint", calls.at(-1).path === "/api/network/providers/p1/review" && calls.at(-1).body.action === "feature");
  check("risk wording: every flag has plain-language text for the admin", ["shared_device", "shared_wallet", "linked_paid", "no_device"].every((f) => typeof hooks.RISK_TEXT[f] === "string" && hooks.RISK_TEXT[f].length > 10));
  opts = hooks.useWithdraw();
  await opts.mutationFn("WALLET");
  check("withdraw: POST the wallet", calls.at(-1).path === "/api/earnings/withdraw" && calls.at(-1).body.wallet === "WALLET");
  opts = hooks.useTopup();
  await opts.mutationFn("SIG");
  check("top-up: POST the transaction signature", calls.at(-1).path === "/api/credits/topup" && calls.at(-1).body.signature === "SIG");
  opts = hooks.useUseReferralCode();
  await opts.mutationFn("ABCD2345");
  check("referral: POST the code", calls.at(-1).path === "/api/shar/referral" && calls.at(-1).body.code === "ABCD2345");

  finish();
})().catch((e) => {
  process.stderr.write(`SHAR-HOOKS TEST CRASHED ${(e && e.stack) || e}\n`);
  process.exit(2);
});
