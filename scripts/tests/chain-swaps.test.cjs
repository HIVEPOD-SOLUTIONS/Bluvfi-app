/**
 * Paying from Arc, Tempo, Robinhood Chain, Zcash and Hyperliquid, and Arc in the wallet: the chain registry is the website's, the phone's half
 * of the swap flows does what the website's does (approve only when short and only the exact amount, report the hash, retry it later, track a
 * wallet deposit), the top-up covers only the shortfall, and every screen and chat card is wired.
 *
 *     node scripts/tests/chain-swaps.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const root = path.join(__dirname, "../..");
const web = path.join(root, "../bluvfi");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const viem = require(path.join(root, "node_modules", "viem"));

(async () => {
  // ── the registry is the website's, field for field
  const app = makeLoader({})("src/lib/swap-chains.ts");
  const appArc = makeLoader({})("src/lib/arc-chain.ts");
  check("the five swap chains, in the website's order, with their ids", app.SWAP_CHAINS.join() === "arc,tempo,robinhood,zcash,hyperliquid" && appArc.arcChain.id === 5042 && app.tempoChain.id === 4217 && app.robinhoodChain.id === 4663);
  check("Arc's USDC is the 6-decimal ERC-20 at 0x3600…, and Tempo's USDC.e the website's address", appArc.ARC_USDC === "0x3600000000000000000000000000000000000000" && app.TEMPO_USDCE === "0x20C000000000000000000000b9537d11c60E8b50");
  check("Arc and Tempo are signed by the wallet (route chains), the others show an address (deposit chains); Zcash and Hyperliquid need your own refund address", app.SWAP_CHAIN_META.arc.kind === "route" && app.SWAP_CHAIN_META.tempo.kind === "route" && ["robinhood", "zcash", "hyperliquid"].every((c) => app.SWAP_CHAIN_META[c].kind === "deposit") && app.SWAP_CHAIN_META.zcash.needsRefundAddress && app.SWAP_CHAIN_META.hyperliquid.needsRefundAddress && !app.SWAP_CHAIN_META.arc.needsRefundAddress);
  check("refund addresses are checked: Zcash transparent (t1/t3) only, Hyperliquid and the EVM chains an 0x address", app.SWAP_CHAIN_META.zcash.refundPattern.test("t1" + "a".repeat(33)) && !app.SWAP_CHAIN_META.zcash.refundPattern.test("zs1" + "a".repeat(40)) && !app.SWAP_CHAIN_META.zcash.refundPattern.test("t2" + "a".repeat(33)) && app.SWAP_CHAIN_META.hyperliquid.refundPattern.test("0x" + "a".repeat(40)) && !app.SWAP_CHAIN_META.hyperliquid.refundPattern.test("0x123"));
  check("the minimum for a deposit chain is $3.20, and Bitrefill and top-ups offer all five", app.MIN_DEPOSIT_SWAP_USD === 3.2 && app.BITREFILL_SWAP_CHAINS.join() === app.SWAP_CHAINS.join() && app.TOPUP_SWAP_CHAINS.join() === app.SWAP_CHAINS.join());
  check("isSwapChain accepts only the five", ["arc", "tempo", "robinhood", "zcash", "hyperliquid"].every(app.isSwapChain) && !["base", "xrp", "", 5, null].some(app.isSwapChain));

  if (fs.existsSync(path.join(web, "src/lib/swap-chains.ts"))) {
    const w = makeLoader({}, web)("src/lib/swap-chains.ts");
    const wArc = makeLoader({}, web)("src/lib/arc-chain.ts");
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const meta = (m, c) => ({ label: m[c].label, icon: m[c].icon, symbol: m[c].symbol, decimals: m[c].decimals, kind: m[c].kind, wallet: m[c].wallet, needs: m[c].needsRefundAddress, pat: m[c].refundPattern.source, hint: m[c].refundHint, ph: m[c].refundPlaceholder, how: m[c].howToPay, tx: m[c].explorerTx("0x" + "ab".repeat(32)) });
    check("every chain's label, symbol, decimals, wallet token, refund rules, wording and explorer link match the website's", w.SWAP_CHAINS.every((c) => same(meta(w.SWAP_CHAIN_META, c), meta(app.SWAP_CHAIN_META, c))));
    check("the chain definitions (id, name, native coin, RPC, explorer) and every constant match the website's", ["arcChain"].every(() => same([wArc.arcChain.id, wArc.arcChain.rpcUrls.default.http, wArc.arcChain.nativeCurrency, wArc.ARC_USDC], [appArc.arcChain.id, appArc.arcChain.rpcUrls.default.http, appArc.arcChain.nativeCurrency, appArc.ARC_USDC])) && same([w.tempoChain.id, w.tempoChain.rpcUrls, w.tempoChain.nativeCurrency, w.robinhoodChain.id, w.robinhoodChain.rpcUrls, w.robinhoodChain.nativeCurrency], [app.tempoChain.id, app.tempoChain.rpcUrls, app.tempoChain.nativeCurrency, app.robinhoodChain.id, app.robinhoodChain.rpcUrls, app.robinhoodChain.nativeCurrency]) && w.TEMPO_USDCE === app.TEMPO_USDCE && w.MIN_DEPOSIT_SWAP_USD === app.MIN_DEPOSIT_SWAP_USD && w.BITREFILL_SWAP_CHAINS.join() === app.BITREFILL_SWAP_CHAINS.join() && w.TOPUP_SWAP_CHAINS.join() === app.TOPUP_SWAP_CHAINS.join());
    const wBills = fs.readFileSync(path.join(web, "src/components/dashboard/bills-screen.tsx"), "utf8");
    const routed = [...(/const BLUVFI_ROUTED = new Set\(\[([^\]]*)\]/.exec(wBills)?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort().join();
    const pm = makeLoader({})("src/lib/payment-methods.ts");
    check("the Bluvfi-routed payment methods are the website's (xrp and the five chains), always offered for any product", routed === [...pm.BLUVFI_ROUTED].sort().join() && pm.BLUVFI_ROUTED.size === 6 && pm.methodsForProduct({ address_based: ["bitcoin"] }).flatMap((g) => g.methods).filter((m) => pm.BLUVFI_ROUTED.has(m.id)).length === 6, routed);
    check("their rails are 'chain' (xrp keeps its own), so they are never sent to Bitrefill's invoice API as a method", ["zcash", "hyperliquid", "arc", "tempo", "robinhood"].every((id) => pm.railOf(id) === "chain") && pm.railOf("xrp") === "xrp" && pm.methodById("tempo").token === "USDC.e" && pm.methodById("robinhood").token === "ETH");
  }

  // ── the request body
  const pc = makeLoader({})("src/lib/product-checkout.ts");
  const input = { product: { id: "netflix-us" }, kind: "card", amount: { kind: "package", pkg: { package_value: "25" } }, method: "arc", email: " me@x.co " };
  const body = pc.chainRequestBody(input, "0xAbC");
  check("the chain purchase body names the chain and the refund address, has no payment method, and the buyer's email gets the code", body.chain === "arc" && body.refundAddress === "0xAbC" && !("paymentMethod" in body) && !("gift" in body) && body.recipientEmail === "me@x.co" && body.productId === "netflix-us" && body.packageId === "25" && !("recipientName" in body));
  const gifted = pc.chainRequestBody({ ...input, method: "robinhood", gift: { recipientName: " Jane ", recipientEmail: " j@x.co ", message: "hi" } }, "0xAbC");
  check("a gift goes through the recipient's name and email (this route has no personal message)", gifted.recipientEmail === "j@x.co" && gifted.recipientName === "Jane" && !("gift" in gifted) && !("message" in gifted));
  check("a typed amount and a top-up number are sent the way the invoice route sends them", pc.chainRequestBody({ ...input, kind: "topup", amount: { kind: "custom", value: 12 }, phoneE164: "+2348012345678" }, "0xA").customValue === 12 && pc.chainRequestBody({ ...input, kind: "topup", amount: { kind: "custom", value: 12 }, phoneE164: "+2348012345678" }, "0xA").sendTo === "+2348012345678");

  // ── the phone's half of the flows, with the wallet and the network faked
  const store = new Map();
  const secure = { getItemAsync: async (k) => store.get(k) ?? null, setItemAsync: async (k, v) => void store.set(k, v), deleteItemAsync: async (k) => void store.delete(k) };
  const sent = []; // every transaction the fake wallet was asked to send
  let allowance = 0n;
  let waited = 0;
  const fakePay = {
    evmPublicClient: (chainId) => ({
      readContract: async ({ functionName }) => (functionName === "allowance" ? allowance : 7_000_000n),
      getBalance: async () => 3_000_000_000_000_000_000n,
      chainId,
    }),
    payEvm: async ({ payment, onLayer }) => {
      onLayer?.(2);
      sent.push({ kind: "tx", ...payment });
      return { hash: "0x" + String(sent.length).padStart(64, "0"), layer: 2 };
    },
    payEvmTransfer: async (o) => {
      sent.push({ kind: "transfer", ...o });
      return { hash: "0x" + "d".repeat(64), layer: 2 };
    },
    waitForEvmTx: async () => void waited++,
  };
  const client = makeLoader({ "expo-secure-store": secure, "@/lib/payments/evm-pay": fakePay })("src/lib/chain-swap-client.ts");

  const calls = [];
  let failReports = 0;
  let failStatus = 500;
  const call = async (p, o = {}) => {
    calls.push({ path: p, ...o });
    if (p.endsWith("/transaction") && failReports > 0) {
      failReports--;
      const e = new Error("down");
      e.status = failStatus;
      throw e;
    }
    return {};
  };
  const WALLET = "0x1111111111111111111111111111111111111111";
  const wallet = { address: WALLET, getProvider: async () => ({}), getAccessToken: async () => "t" };
  const payment = {
    chainId: 5042,
    approval: { token: "0x3600000000000000000000000000000000000000", spender: "0x2222222222222222222222222222222222222222", amount: "25500000" },
    transactionRequest: { to: "0x3333333333333333333333333333333333333333", data: "0xabcdef", value: "0" },
  };
  const stages = [];
  const run = (over = {}) => client.payRouteSwap({ chain: "arc", payment, refundAddress: WALLET, reportUrl: "/api/bitrefill/chain-purchase/w1/transaction", wallet, call, onStage: (s) => stages.push(s), ...over });

  const hash1 = await run();
  const approve = sent[0];
  const decoded = viem.decodeFunctionData({ abi: viem.erc20Abi, data: approve.data });
  check("a route payment with a short allowance approves the exact amount to the router first, then signs the swap, then reports", sent.length === 2 && approve.to === payment.approval.token && decoded.functionName === "approve" && decoded.args[0] === payment.approval.spender && decoded.args[1] === 25_500_000n && sent[1].to === payment.transactionRequest.to && sent[1].data === "0xabcdef" && sent[1].value === undefined && [...new Set(stages)].join() === "approving,paying,confirming" && hash1 === "0x" + "2".padStart(64, "0"));
  check("the signed hash is reported to the swap's own transaction URL, and the phone waits for it to mine", calls.at(-1).path === "/api/bitrefill/chain-purchase/w1/transaction" && calls.at(-1).body.txHash === hash1 && waited >= 2);
  check("the report is cleared from the phone's pending list once the server has it", JSON.parse(store.get("bluvfi.pending-route-reports") ?? "[]").length === 0);

  sent.length = 0;
  stages.length = 0;
  allowance = 25_500_000n;
  await run();
  check("with enough allowance already there it does not approve again (no approval prompt)", sent.length === 1 && sent[0].to === payment.transactionRequest.to && !stages.includes("approving"));

  const throwsWith = async (fn, re) => {
    try {
      await fn();
      return false;
    } catch (e) {
      return re.test(e.message);
    }
  };
  sent.length = 0;
  check("a payment prepared for another wallet is refused before anything is signed", (await throwsWith(() => run({ refundAddress: "0x9999999999999999999999999999999999999999" }), /different wallet/)) && sent.length === 0);
  check("a route for the wrong network is refused", (await throwsWith(() => run({ payment: { ...payment, chainId: 1 } }), /unexpected network/)) && sent.length === 0);
  check("a route with no transaction is refused, and so is a chain the wallet can't sign (Zcash)", (await throwsWith(() => run({ payment: { chainId: 5042 } }), /no transaction/)) && (await throwsWith(() => run({ chain: "zcash" }), /aren’t signed in the app/)) && sent.length === 0);
  check("Tempo's route is signed on Tempo (chain 4217) the same way", await (async () => {
    sent.length = 0;
    allowance = 0n;
    await run({ chain: "tempo", payment: { ...payment, chainId: 4217, approval: { ...payment.approval, token: app.TEMPO_USDCE } } });
    return sent.length === 2 && sent.every((t) => t.chainId === 4217);
  })());

  // a hash the server can't take right now is kept and sent on the next launch
  sent.length = 0;
  calls.length = 0;
  failReports = 3;
  allowance = 25_500_000n;
  const hash2 = await run();
  const pending = JSON.parse(store.get("bluvfi.pending-route-reports"));
  check("if the server can't take the hash (three failures) it stays on the phone and the payment still succeeds", calls.filter((c) => c.path.endsWith("/transaction")).length === 3 && pending.length === 1 && pending[0].txHash === hash2 && pending[0].url === "/api/bitrefill/chain-purchase/w1/transaction");
  calls.length = 0;
  await client.retryPendingRouteReports(call);
  check("on the next launch the hash is sent again and the list is cleared", calls.length === 1 && calls[0].body.txHash === hash2 && JSON.parse(store.get("bluvfi.pending-route-reports")).length === 0);
  failReports = 3;
  failStatus = 409;
  await run();
  check("a refusal from the server (a 4xx: it already has a decision) is not retried forever", JSON.parse(store.get("bluvfi.pending-route-reports") ?? "[]").length === 0);
  failStatus = 500;
  store.set("bluvfi.pending-route-reports", JSON.stringify([{ url: "/x/transaction", txHash: "0xold", at: Date.now() - 8 * 86_400_000 }]));
  calls.length = 0;
  await client.retryPendingRouteReports(call);
  check("a report older than a week is dropped, not sent", calls.length === 0 && JSON.parse(store.get("bluvfi.pending-route-reports")).length === 0);
  store.set("bluvfi.pending-route-reports", "{not json");
  check("a damaged pending list is ignored, not a crash", (await client.retryPendingRouteReports(call)) === undefined);

  // paying a deposit from the wallet (Robinhood Chain ETH)
  sent.length = 0;
  calls.length = 0;
  await client.payDepositFromWallet({ chain: "robinhood", depositAddress: "0x4444444444444444444444444444444444444444", amount: "0.0123", wallet, track: { walletRequestId: "w9", call } });
  const dep = sent[0];
  check("Robinhood Chain ETH is sent from the wallet as a native transfer on chain 4663 for exactly the amount", dep.kind === "transfer" && dep.chainId === 4663 && dep.token === "native" && dep.decimals === 18 && dep.amount === "0.0123" && dep.recipient === "0x4444444444444444444444444444444444444444" && dep.symbol === "ETH");
  check("the transfer's hash is recorded on the swap's ledger row", calls[0].path === "/api/chain-swaps/w9/user-tx" && calls[0].body.txHash === "0x" + "d".repeat(64));
  check("Zcash and Hyperliquid can't be paid from the Bluvfi wallet, and say so", (await throwsWith(() => client.payDepositFromWallet({ chain: "zcash", depositAddress: "x", amount: "1", wallet }), /can’t be paid from the Bluvfi wallet/)) && (await throwsWith(() => client.payDepositFromWallet({ chain: "arc", depositAddress: "x", amount: "1", wallet }), /can’t be paid from the Bluvfi wallet/)));

  // balances
  check("the wallet's balance on a chain is read in its own decimals (Arc USDC 7, Robinhood ETH 3)", (await client.walletSwapBalance("arc", WALLET)) === 7 && (await client.walletSwapBalance("robinhood", WALLET)) === 3 && (await client.walletSwapBalance("zcash", WALLET)) === null && (await client.baseBalance("usdc", WALLET)) === 7 && (await client.baseBalance("eth", WALLET)) === 3);

  // the top-up covers only the shortfall
  const plan = (o) => client.topUpPlan({ token: "usdc", kind: "route", minUsd: 3.2, ...o });
  check("a top-up asks for only what the Base wallet is short of, plus 0.5% headroom, rounded up", plan({ need: 25, needUsd: 25, onBase: 10 }).amount === "15.08" && plan({ need: 25, needUsd: 25, onBase: 10 }).covered === false && plan({ need: 25, needUsd: 25, onBase: 0 }).amount === "25.13");
  check("when the Base wallet already has enough it is covered and nothing is asked", plan({ need: 25, needUsd: 25, onBase: 25 }).covered && plan({ need: 25, needUsd: 25, onBase: 40 }).covered);
  check("if the balance can't be read the whole amount is asked for (never assumed covered)", plan({ need: 25, needUsd: 25, onBase: null }).covered === false && plan({ need: 25, needUsd: 25, onBase: null }).amount === "25.13");
  check("a small shortfall from a deposit chain rounds up to its $3.20 minimum, and a route chain does not", plan({ need: 2, needUsd: 2, onBase: 0, kind: "deposit" }).usd === 3.2 && plan({ need: 2, needUsd: 2, onBase: 0, kind: "deposit" }).amount === "3.20" && plan({ need: 2, needUsd: 2, onBase: 0, kind: "route" }).amount === "2.01");
  check("an ETH top-up works in ETH to six places and converts the minimum at the ETH price", client.topUpPlan({ need: 0.01, needUsd: 30, onBase: 0, token: "eth", kind: "deposit", minUsd: 3.2 }).amount === "0.010050" && client.topUpPlan({ need: 0.0005, needUsd: 1.5, onBase: 0, token: "eth", kind: "deposit", minUsd: 3.2 }).usd === 3.2);

  // thin API helpers
  calls.length = 0;
  await client.startChainPurchase(call, { chain: "arc", refundAddress: WALLET, productId: "p", packageId: "5" });
  await client.startChainTopUp(call, { chain: "tempo", token: "usdc", amount: "5", amountUsd: 5, recipient: WALLET, purpose: "stocks" });
  await client.chainTopUpStatus(call, "a b");
  check("the API calls go to the website's routes with the website's bodies", calls[0].path === "/api/bitrefill/chain-purchase" && calls[0].method === "POST" && calls[1].path === "/api/chain-topup" && calls[1].body.purpose === "stocks" && calls[2].path === "/api/chain-topup/a%20b");

  // ── the EVM layers know the new chains
  const common = makeLoader({})("src/lib/payments/evm-common.ts");
  check("the wallet can sign on Arc, Robinhood Chain and Tempo as well as the usual five and Doma", [5042, 4663, 4217, 1, 8453, 137, 42161, 10, 97477].every((id) => common.evmChain(id).id === id));
  const authSrc = read("src/lib/auth-context.tsx");
  check("Privy is told about all three, so switching the wallet to them works", authSrc.includes("arcChain, robinhoodChain, tempoChain]"));
  const payEvm = read("src/lib/payments/evm-pay.ts");
  check("Circle's send can do Arc transfers, and Tempo (which has no gas coin) skips the native-gas check", payEvm.includes("[arcChain.id]: 'Arc'") && payEvm.includes("if (payment.chainId !== tempoChain.id)"));

  // ── Arc in the wallet
  const arcKit = read("src/lib/arc-kit.ts");
  check("Bridge can bring USDC from Arc, and can land it on Arc through Circle's forwarder (no Arc gas to receive)", arcKit.includes("{ value: 'Arc', label: 'Arc'") && arcKit.includes("BRIDGE_DESTINATIONS") && /value: 'Arc', label: 'Arc', icon: '🟣', useForwarder: true/.test(arcKit) && /value: 'Base', label: 'Base', icon: '🔷', useForwarder: false/.test(arcKit));
  const circle = (n) => require(path.join(root, "node_modules", n, "package.json")).version.split(".").map(Number);
  check("the Circle kit installed is new enough for Arc (App Kit 1.15 and later)", circle("@circle-fin/app-kit")[0] === 1 && circle("@circle-fin/app-kit")[1] >= 15);
  const tabs = read("src/components/dashboard/WalletTabs.tsx");
  check("the bridge sends to Arc with the forwarder and to Base with the wallet, the History row names the real destination, and a chain can't be bridged to itself", tabs.includes("useForwarder: true") && tabs.includes("selectedDest.useForwarder") && tabs.includes("→ ${selectedDest.label}") && tabs.includes("sourceOptions = BRIDGE_SOURCE_OPTIONS.filter((o) => o.value !== destination)"));
  check("the Arc tab shows the balance and explorer link, sends USDC on Arc through the shared layers, records it, and opens Bridge on Arc", tabs.includes("export function ArcTab") && tabs.includes("chainId: arcChain.id") && tabs.includes("chain: 'arc'") && tabs.includes("Bring USDC to Arc") && tabs.includes("arcAddressUrl(address)") && /setBridgeDest\('Arc'\)/.test(read("src/components/dashboard/FundWalletSheet.tsx")) && read("src/components/dashboard/FundWalletSheet.tsx").includes("label: '🟣 Arc'"));
  const ub = read("src/hooks/use-unified-balance.ts");
  check("the unified balance includes Arc, and Home's wallet card shows its USDC", ub.includes("'Arc']") && ub.includes("Arc: { label: 'Arc'") && read("src/app/(tabs)/index.tsx").includes("useArcUsdcBalance()") && read("src/hooks/use-arc-balance.ts").includes("ARC_USDC"));
  const hist = read("src/components/dashboard/HistorySection.tsx");
  check("History names every new network and the Domain type, and links their transactions", ["arc", "zcash", "hyperliquid", "robinhood", "tempo", "doma", "backpack"].every((c) => hist.includes(`chain === '${c}'`)) && hist.includes("domain: { icon") && read("src/lib/purchase-detail.ts").includes("SWAP_EXPLORER"));

  // ── the screens and cards
  const sheet = read("src/components/dashboard/BitrefillProductSheet.tsx");
  check("the Bitrefill checkout pays the chain methods: it signs Arc and Tempo from the wallet, shows addresses for the rest (Robinhood has a one-tap wallet send), and asks Zcash and Hyperliquid for a refund address", sheet.includes("chosen.rail === 'chain'") && sheet.includes("startChainPurchase(call, chainRequestBody(") && sheet.includes("payRouteSwap({") && sheet.includes("payChainFromWallet") && sheet.includes("needsRefundAddress") && sheet.includes("chain-purchase/${encodeURIComponent(purchase.walletRequestId)}/transaction"));
  check("it follows the swap too: a failed or expired one ends the wait with where the money is, and a too-small order says the minimum", sheet.includes("swapId") && sheet.includes("row.status === 'failed' || row.status === 'expired'") && sheet.includes("MIN_DEPOSIT_SWAP_USD"));
  check("a deposit shows its memo when the swap needs one, and the refund note", read("src/components/dashboard/DepositPanel.tsx").includes("info.memo") && sheet.includes("refunded to the address ending"));
  const cr = read("src/components/dashboard/CryptorefillsProductSheet.tsx");
  check("Cryptorefills offers each of the five chains as its own chip (Arc, Tempo, Robinhood Chain, Zcash, Hyperliquid): picking one tops up the Base wallet from that chain first, then pays on Base", cr.includes("{ chain: SwapChain }") && cr.includes("SWAP_CHAINS.map((c)") && cr.includes("setPay({ chain: c })") && cr.includes("<ChainTopUpPanel key={pay.chain} initialChain={pay.chain}") && !cr.includes("label=\"Other chain\"") && cr.includes("'chain' in pay && !funded"));
  const stock = read("src/components/invest/StockSheet.tsx");
  check("a stock buy can be paid from another chain, and the Confirm button waits for the top-up", stock.includes("<ChainTopUpPanel") && stock.includes("purpose=\"stocks\"") && stock.includes("showTopUp && quote.side === 'buy' && fromWallet > 0"));
  const panel = read("src/components/dashboard/ChainTopUpPanel.tsx");
  check("the top-up panel reads the Base balance first, asks only for the shortfall, refunds to the right place, watches until it lands, and works inside the chat modal", panel.includes("baseBalance(token, address)") && panel.includes("topUpPlan(") && panel.includes("chainTopUpStatus(call") && panel.includes("setInterval(check, 6000)") && panel.includes("inChat") && panel.includes("RefundField") && panel.includes("/transaction"));
  for (const [file, what] of [["CryptorefillsPaymentCard", "Cryptorefills"], ["StockTradeCard", "stock"], ["DomaListingCard", "Doma"]]) {
    const src = read(`src/components/chat/${file}.tsx`);
    check(`the assistant's ${what} card offers "Pay from Arc, Tempo, Robinhood Chain, Zcash or Hyperliquid instead" and starts there when the assistant asked for it (fundFrom)`, src.includes("<ChainTopUpPanel") && src.includes("inChat") && src.includes("isSwapChain(output.fundFrom)") && src.includes("<MoreChainsLink") && read("src/components/dashboard/PaymentMethodPicker.tsx").includes("Pay from Arc, Tempo, Robinhood Chain, Zcash or Hyperliquid instead"));
  }
  const doma = read("src/components/chat/DomaListingCard.tsx");
  check("only Base listings priced in ETH or USDC can be funded from another chain, and the ETH amount is priced live", doma.includes("listing.chainId === 8453") && doma.includes("'/api/prices'") && doma.includes("purpose=\"doma\""));
  check("Doma purchases and registrations are written to History as 'domain', as on the website", doma.includes("type: 'domain'") && read("src/components/chat/DomaPaymentCard.tsx").includes("type: 'domain'") && read("src/components/chat/DomaPaymentCard.tsx").includes("chain: 'doma'"));
  const chat = read("src/components/chat/ChatSheet.tsx");
  check("the chat shows the Arc send card and the top-up card for the assistant's two new tools", chat.includes("out?.arcSend === true") && chat.includes("out?.chainTopUp === true") && chat.includes("<ArcSendCard") && chat.includes("<ChainTopUpCard"));
  const arcCard = read("src/components/chat/ArcSendCard.tsx");
  check("the Arc send card moves nothing until Send is tapped, records the send, and reports sent or not back to the assistant", arcCard.includes("send_usdc_arc") && arcCard.includes("report({ sent: true, txHash: hash })") && arcCard.includes("Cancelled by user") && arcCard.includes("chain: 'arc'"));
  const topCard = read("src/components/chat/ChainTopUpCard.tsx");
  check("the top-up card reports {funded: true} back so the assistant carries on", topCard.includes("fund_wallet_from_chain") && topCard.includes("funded: true") && topCard.includes("purpose=\"wallet\""));
  const bpc = read("src/components/chat/BitrefillPaymentCard.tsx");
  check("the assistant's Bitrefill card pays Arc and Tempo by creating the invoice and signing the route when Pay is tapped, and reports the invoice to poll", bpc.includes("arcCheckout") && bpc.includes("startChainPurchase(call") && bpc.includes("payRouteSwap({") && bpc.includes("poll_bitrefill_order(invoiceId=") && bpc.includes("isRoute"));
  const trc = read("src/components/chat/ToolResultCard.tsx");
  check("an address-based result for Zcash, Hyperliquid or Robinhood shows how to pay, the memo, the refund address, and (Robinhood) the one-tap wallet send", trc.includes("swapMeta.howToPay") && trc.includes("RobinhoodWalletPay") && trc.includes("data.depositMemo") && trc.includes("data.refundAddress"));
  check("the new chain wallet pieces never run in a plain chat modal with the bottom sheet's text input", !read("src/components/chat/ChainTopUpCard.tsx").includes("BottomSheetTextInput") && panel.includes("<TextInput"));

  finish();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
