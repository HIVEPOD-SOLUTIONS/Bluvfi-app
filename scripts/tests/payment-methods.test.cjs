/**
 * The Bitrefill payment methods in the app: that every one is a method Bitrefill really takes (cross-checked against the website's list when
 * the web repo is next to this one), how each is paid, which are offered for a product, their logos, and that XRP, which isn't a Bitrefill
 * method, never reaches the invoice API (that was the "Invalid arguments for buy-products" error).
 *
 *     node scripts/tests/payment-methods.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const app = path.join(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(app, p), "utf8");
const load = makeLoader({});

const pm = load("src/lib/payment-methods.ts");
const logos = load("src/lib/payment-logos.ts");
const pc = load("src/lib/product-checkout.ts");
const ids = pm.PAYMENT_METHODS.map((m) => m.id);

check("every method has a unique id", new Set(ids).size === ids.length && ids.length >= 38, `${ids.length} methods`);
check("the website's groups, in its order (USDT, USDC, then BRUSD, Crypto and Exchange Pay)", pm.GROUP_ORDER.join() === "USDT,USDC,BRUSD,Crypto,Exchange Pay" && pm.PAYMENT_METHODS.every((m) => pm.GROUP_ORDER.includes(m.group)));

// ── against the website's own list
const webSrc = path.join(app, "../bluvfi/src/components/dashboard/bills-screen.tsx");
const webMcp = path.join(app, "../bluvfi/src/lib/bitrefill-mcp.ts");
if (fs.existsSync(webSrc) && fs.existsSync(webMcp)) {
  const web = fs.readFileSync(webSrc, "utf8");
  const defs = [...web.matchAll(/\{ id: "([a-z0-9_]+)",\s*label: "[^"]*",\s*token: "[^"]*",\s*icon: "[^"]*",\s*badge: "[^"]*",\s*badgeColor: "[^"]*",\s*chain: "(evm|solana|address|link)"/g)].map((m) => ({ id: m[1], chain: m[2] }));
  const webIds = new Set(defs.map((d) => d.id));
  const bad = ids.filter((id) => !webIds.has(id));
  check("every method the app offers is one the website offers too (so Bitrefill takes it)", defs.length > 30 && bad.length === 0, `not on the website: ${bad.join(", ")}`);
  const missing = [...webIds].filter((id) => !ids.includes(id));
  check("and the app offers every method the website does", missing.length === 0, `missing: ${missing.join(", ")}`);
  const walletIds = pm.PAYMENT_METHODS.filter((m) => m.rail === "wallet").map((m) => m.id);
  const webWallet = new Set(defs.filter((d) => d.chain === "evm" || d.chain === "solana").map((d) => d.id));
  check("everything the app pays from the wallet is a wallet method on the website too (a subset: BSC is a deposit in the app)", walletIds.every((id) => webWallet.has(id)));
  const mcp = fs.readFileSync(webMcp, "utf8");
  const addrSet = (/ADDRESS_BASED_PAYMENT_METHODS = new Set\(\[([\s\S]*?)\]\)/.exec(mcp) || [])[1] || "";
  const serverAddress = new Set([...addrSet.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
  const deposits = pm.PAYMENT_METHODS.filter((m) => m.rail === "address").map((m) => m.id);
  check("every deposit method is one the server knows is address-based (its list drives how invoices are recorded)", deposits.every((id) => serverAddress.has(id)), deposits.filter((id) => !serverAddress.has(id)).join(", "));
} else {
  console.log("SKIP website cross-check: the web repo isn't next to this one");
}

// ── how each is paid
const evmPay = read("src/lib/payments/evm-pay.ts");
const evmTokens = (/EVM_TOKENS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(evmPay) || [])[1] || "";
const evmIds = new Set([...evmTokens.matchAll(/^\s*([a-z0-9_]+):/gm)].map((m) => m[1]));
const wallet = pm.PAYMENT_METHODS.filter((m) => m.rail === "wallet");
check("every wallet-rail method has a payer in the app (an EVM token contract, or a Solana SPL transfer)", wallet.length === 12 && wallet.every((m) => evmIds.has(m.id) || m.id === "usdc_solana" || m.id === "usdt_solana"), wallet.filter((m) => !evmIds.has(m.id) && !m.id.endsWith("_solana")).map((m) => m.id).join(", "));
check("and everything the app can pay from the wallet is offered as a wallet method", [...evmIds].every((id) => pm.railOf(id) === "wallet"));
check("XRP is the only method on the xrp rail; Binance and Kraken are links; everything else sends to a deposit address", pm.PAYMENT_METHODS.filter((m) => m.rail === "xrp").map((m) => m.id).join() === "xrp" && pm.PAYMENT_METHODS.filter((m) => m.rail === "link").map((m) => m.id).join() === "binance_pay,kraken_pay" && pm.railOf("bitcoin") === "address" && pm.railOf("usdt_trc20") === "address" && pm.railOf("nonsense") === "address");

// ── which are offered
const flat = (g) => g.flatMap((x) => x.methods.map((m) => m.id));
const list = { address_based: ["usdc_base", "usdc_solana", "usdt_trc20", "bitcoin", "usdc_optimism"], link_only: ["fiat_card", "binance_pay"] };
const offered = pm.methodsForProduct(list);
check("a product's own list decides: only what it accepts (plus XRP), grouped, with fiat left out", flat(offered).includes("usdc_base") && flat(offered).includes("bitcoin") && flat(offered).includes("binance_pay") && flat(offered).includes("xrp") && flat(offered).includes("usdc_optimism") && !flat(offered).includes("fiat_card") && !flat(offered).includes("usdt_erc20") && offered.map((g) => g.group).join() === pm.GROUP_ORDER.filter((g) => offered.some((x) => x.group === g)).join());
const noList = pm.methodsForProduct(undefined);
check("before a product's list has loaded only the safe wallet methods and XRP are offered (never Optimism or USDT on Base on a guess)", flat(noList).includes("usdc_base") && flat(noList).includes("xrp") && !flat(noList).includes("usdc_optimism") && !flat(noList).includes("usdt_optimism") && !flat(noList).includes("usdt_base") && !flat(noList).includes("bitcoin") && pm.methodsForProduct({}).length === noList.length);
check("the methods that Bitrefill only takes for some products are offered only when listed", flat(pm.methodsForProduct({ address_based: ["usdt_base"] })).includes("usdt_base") && !flat(pm.methodsForProduct({ address_based: ["usdc_base"] })).includes("usdt_base"));
check("the starting method is USDC on Base when offered, else the first", pm.defaultMethod(noList) === "usdc_base" && pm.defaultMethod(pm.methodsForProduct({ address_based: ["bitcoin"] })) === "bitcoin" && pm.defaultMethod([]) === null);
check("the summary reads 'USDC on Base', 'BTC on Bitcoin', 'XRP on XRP Ledger'", pm.methodSummary(pm.methodById("usdc_base")) === "USDC on Base" && pm.methodSummary(pm.methodById("bitcoin")) === "BTC on Bitcoin" && pm.methodSummary(pm.methodById("xrp")) === "XRP on XRP Ledger");

// ── errors
const MCP = "MCP error -32602: Input validation error: Invalid arguments for buy-products: [ { \"code\": \"invalid_value\", \"values\": [ \"ethereum\" ], \"path\": [ \"paymentMethod\" ] } ]";
check("the raw API error that XRP used to cause becomes a plain sentence", /payment method isn’t available/.test(pm.friendlyInvoiceError(MCP)) && !/MCP|-32602|invalid_value/.test(pm.friendlyInvoiceError(MCP)));
check("other errors are readable too: daily limit, rate limit, Bitrefill down, XRP off, empty, very long", /daily purchase limit/.test(pm.friendlyInvoiceError("PURCHASE_LIMIT_REACHED")) && /Too many requests/.test(pm.friendlyInvoiceError("rate_limit_reached")) && /temporarily unavailable/.test(pm.friendlyInvoiceError("Bad Gateway")) && /XRP isn’t available/.test(pm.friendlyInvoiceError("XRPL service not configured")) && /try again/i.test(pm.friendlyInvoiceError("")) && pm.friendlyInvoiceError("x".repeat(500)).length <= 220 && pm.friendlyInvoiceError("Insufficient balance") === "Insufficient balance");

// ── logos
const all = pm.PAYMENT_METHODS.map((m) => ({ m, l: logos.methodLogos(m) }));
check("every method has a logo to draw (a coin logo, or at least a coloured symbol)", all.every(({ l }) => l.main && l.main.glyph && /^#[0-9A-Fa-f]{6}$/.test(l.main.color)));
const noImage = all.filter(({ l }) => l.main.uris.length === 0).map(({ m }) => m.id);
check("every coin and token has a real logo address, except the few no public CDN has (BRUSD, BRC, Kraken)", noImage.every((id) => /^brusd_|^brc_|kraken/.test(id)), noImage.join(", "));
check("all logo addresses are https from the two CDNs the app already uses", all.every(({ l }) => [l.main, l.badge].filter(Boolean).every((s) => s.uris.every((u) => /^https:\/\/(s2\.coinmarketcap\.com\/static\/img\/coins\/64x64\/\d+\.png|icons\.llamao\.fi\/icons\/chains\/rsz_[a-z]+\.jpg)$/.test(u)))));
check("stablecoins show their token with their chain in the corner (USDC on Base, USDT on Tron)", (() => { const b = logos.methodLogos(pm.methodById("usdc_base")); const t = logos.methodLogos(pm.methodById("usdt_trc20")); return b.badge && b.badge.uris[0].includes("rsz_base") && b.main.uris[0].includes("/3408.png") && t.badge && t.badge.uris[0].includes("rsz_tron") && t.main.uris[0].includes("/825.png"); })());
check("native coins are just their logo; ETH on Base or Arbitrum shows its chain; Lightning has a bolt", (() => { const btc = logos.methodLogos(pm.methodById("bitcoin")); const eth = logos.methodLogos(pm.methodById("ethereum")); const ethBase = logos.methodLogos(pm.methodById("eth_base")); const ln = logos.methodLogos(pm.methodById("lightning")); const xrp = logos.methodLogos(pm.methodById("xrp")); return btc.badge === null && eth.badge === null && ethBase.badge && ln.bolt === true && ln.badge === null && xrp.badge === null && xrp.main.uris[0].includes("/52.png"); })());
check("every chain has its own logo address or its coin's (Arc, Robinhood Chain, X Layer and World Chain have no public icon, so they show a lettered circle)", Object.keys(pm.CHAIN_NAME).filter((c) => !["kraken", "xlayer", "worldchain", "arc", "robinhood"].includes(c)).every((c) => logos.chainLogo(c).uris.length > 0));

// ── wiring
const sheet = read("src/components/dashboard/BitrefillProductSheet.tsx");
const picker = read("src/components/dashboard/PaymentMethodPicker.tsx");
const deposit = read("src/components/dashboard/DepositPanel.tsx");
check("the checkout offers the methods for the product through the picker, each chip with its logo", sheet.includes("methodsForProduct(product?.payment_methods)") && sheet.includes("<PaymentMethodPicker") && picker.includes("<MethodLogo method={x} />") && picker.includes("expo-image") && picker.includes("onError={() => setTried((n) => n + 1)}"));
check("XRP goes to its own endpoint and never to the invoice API as a method", sheet.includes("chosen.rail === 'xrp'") && sheet.includes("'/api/bitrefill/xrp-purchase'") && /rail === 'xrp'[\s\S]*?xrp-purchase[\s\S]*?return;[\s\S]*?'\/api\/bitrefill\/invoice'/.test(sheet));
check("wallet methods pay with the payment card; deposit methods show their address, amount and QR and watch the order; links open Bitrefill", sheet.includes("chosen.rail === 'wallet'") && sheet.includes("<BitrefillPaymentCard") && sheet.includes("<DepositPanel") && sheet.includes("depositFromInvoice(inv)") && deposit.includes("QRCodeStyled") && deposit.includes("SEND EXACTLY") && deposit.includes("Copy") && sheet.includes("chosen.rail === 'link'") && sheet.includes("Linking.openURL(inv.payment_link)"));
check("a deposit completes by itself: it is watched from the moment the address is shown, with the longer deposit deadline", sheet.includes("{ stay: true, giveUpMs: DEPOSIT_POLL_GIVE_UP_MS }") && !deposit.includes("I've sent"));
check("XRP can be paid from the person's own Bluvfi XRP wallet, as on the website", sheet.includes("'/api/xrpl/transfer'") && sheet.includes("sourceWalletRequestId: x.sidebarWalletId") && sheet.includes("destinationWalletRequestId: x.swapWalletId") && sheet.includes("Pay from my Bluvfi XRP wallet"));
check("errors from creating the order are shown as plain sentences", sheet.includes("friendlyInvoiceError("));

// ── the request bodies
const input = { product: { id: "mtn-ng" }, kind: "topup", amount: { kind: "custom", value: 500 }, method: "xrp", email: " a@b.co ", phoneE164: "+2348012345678", gift: { recipientName: "Jo", recipientEmail: "jo@b.co" } };
const xrpBody = pc.xrpRequestBody(input);
check("the XRP request has the product, the amount, the email and the number, but no payment method and no gift", xrpBody.productId === "mtn-ng" && xrpBody.customValue === 500 && xrpBody.recipientEmail === "a@b.co" && xrpBody.sendTo === "+2348012345678" && !("paymentMethod" in xrpBody) && !("gift" in xrpBody));
check("a fixed package sends its package value to the XRP endpoint too", pc.xrpRequestBody({ ...input, kind: "card", amount: { kind: "package", pkg: { package_value: "25" } } }).packageId === "25");
const dep = pc.depositFromInvoice({ payment_info: { address: "bc1qxyz", altcoinPrice: "0.00031", currency: "BTC", paymentUri: "bitcoin:bc1qxyz?amount=0.00031" }, payment_link: "https://bitrefill.com/i/1", expiration_minutes: 15 });
check("a deposit invoice gives the address, the exact coin amount, the wallet link and the expiry", dep && dep.address === "bc1qxyz" && dep.amount === "0.00031" && dep.currency === "BTC" && dep.paymentUri.startsWith("bitcoin:") && dep.expiresInMinutes === 15 && dep.paymentLink === "https://bitrefill.com/i/1");
check("a deposit with no amount still shows its address (the page shows the amount), and no address means no deposit", pc.depositFromInvoice({ payment_info: { address: "a" } }).amount === null && pc.depositFromInvoice({ payment_info: { amount: 5 } }) === null && pc.depositFromInvoice(null) === null);
const order = pc.xrpOrderFrom({ invoiceId: "inv", invoiceAccessToken: "tok", paymentAddress: "rSwap", requiredActivationXrp: 12.5, xrplWalletRequestId: "w1", sidebarWallet: { id: "s1", address: "rMine" }, expirationMinutes: 8 });
check("the XRP order gives the swap address, the exact XRP (swap plus activation reserve), both wallets and the token", order && order.address === "rSwap" && order.amountXrp === "12.5" && order.swapWalletId === "w1" && order.sidebarWalletId === "s1" && order.accessToken === "tok" && order.invoiceId === "inv" && pc.xrpOrderFrom({ invoiceId: "i", paymentAddress: "a" }) === null && pc.xrpOrderFrom({}) === null);

check("a gift carries a sender name (Bitrefill requires one) along with the recipient", (() => { const b = pc.invoiceRequestBody({ product: { id: "x" }, kind: "card", amount: { kind: "package", pkg: { package_value: "25" } }, method: "usdc_base", email: "a@b.co", gift: { recipientName: " Jo ", recipientEmail: " jo@b.co ", message: "hi", theme: "green" } }); return b.gift.sender_name === "Bluvfi" && b.gift.recipient_name === "Jo" && b.gift.recipient_email === "jo@b.co" && b.gift.message === "hi" && b.gift.theme === "green"; })());

check("a deposit that has not been sent says it is waiting for the payment (it never claims a payment that has not happened); once paid it says so", pc.invoiceOutcome({ status: "unpaid" }, false, true).message === "Waiting for your payment…" && /Payment sent/.test(pc.invoiceOutcome({ status: "unpaid" }, false, false).message) && /detected/.test(pc.invoiceOutcome({ status: "payment_detected" }, false, true).message) && pc.invoiceOutcome({ status: "complete", code: "A1" }, false, true).state === "done");

// ── chips that would read the same name their network
const net = (id) => logos.methodNetworkName(pm.methodById(id));
check("chips whose label doesn't say the network name it (ETH on Base, USDC on Arc/Hyperliquid, USDC.e on Tempo, ETH on Robinhood Chain, BRC on Solana)", net("eth_base") === "Base" && net("eth_arbitrum") === "Arbitrum" && net("arc") === "Arc" && net("hyperliquid") === "Hyperliquid" && net("tempo") === "Tempo" && net("robinhood") === "Robinhood Chain" && net("brc_solana") === "Solana" && net("usdc_tempo") === "Tempo");
check("chips that already say it, or whose coin is native to its chain, add nothing (USDC on Base, Bitcoin, XRP, Zcash, ETH on Ethereum, Lightning)", ["usdc_base", "bitcoin", "xrp", "zcash", "ethereum", "lightning", "usdt_trc20", "litecoin", "sui"].every((id) => net(id) === null));

finish();
