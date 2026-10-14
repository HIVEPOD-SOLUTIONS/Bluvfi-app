/**
 * The Cryptorefills checkout's logos and gift option, the clearer bottom menu, and the drawn send arrow.
 *
 *     node scripts/tests/cryptorefills-ui.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const read = (p) => fs.readFileSync(path.join(__dirname, "../..", p), "utf8");
const load = makeLoader({});

// ── logos for every coin and network Cryptorefills accepts (the list its payment-methods API returned)
const lg = load("src/lib/cryptorefills-logos.ts");
const COINS = ["USDT", "BTC", "SOL", "USDC", "ETH", "LTC", "WLD", "TRX", "TON", "USDC.e", "DOGE", "USDS", "USD1", "EUROC", "SUI", "USDT.e", "PYUSD", "FDUSD", "USDm", "GRAM", "USDSC", "USDE", "DAI"];
const NETWORKS = ["ETH Mainnet", "Polygon (Matic)", "Avalanche", "Arbitrum", "Optimism", "Binance Smart Chain", "Plasma", "Soneium", "X Layer", "Celo", "Tron", "Solana", "Ton", "Mainnet", "Lightning", "Base", "Sonic", "Sui", "WorldChain"];
const noLogo = COINS.filter((c) => lg.crTokenLogo(c).uris.length === 0);
check("every coin has a coloured symbol to fall back on, and a real logo for all but the few no public source has (USDm, USDSC)", COINS.every((c) => { const l = lg.crTokenLogo(c); return l.glyph && /^#[0-9A-Fa-f]{6}$/.test(l.color); }) && noLogo.every((c) => ["USDm", "USDSC"].includes(c)), noLogo.join(", "));
check("bridged tokens use their base coin's logo (USDC.e is USDC, USDT.e is USDT); GRAM is the TON logo", lg.crTokenLogo("USDC.e").uris[0] === lg.crTokenLogo("USDC").uris[0] && lg.crTokenLogo("USDT.e").uris[0] === lg.crTokenLogo("USDT").uris[0] && lg.crTokenLogo("GRAM").uris[0] === lg.crTokenLogo("TON").uris[0]);
check("each coin's logo is its own CoinMarketCap id (verified: USDS 33039, WLD 13502, USD1 36148, EUROC 20641, PYUSD 27772, FDUSD 26081, USDe 29470, DAI 4943, TRX 1958)", [["USDS", 33039], ["WLD", 13502], ["USD1", 36148], ["EUROC", 20641], ["PYUSD", 27772], ["FDUSD", 26081], ["USDE", 29470], ["DAI", 4943], ["TRX", 1958]].every(([c, id]) => lg.crTokenLogo(c).uris[0].endsWith(`/${id}.png`)));
const coinFor = (n) => (n === "Mainnet" ? "BTC" : "USDT");
const noChain = NETWORKS.filter((n) => lg.crChainLogo(n, coinFor(n)).uris.length === 0);
check("every network has a logo except the two no icon source has (X Layer, World Chain), which get a lettered circle", noChain.sort().join() === "WorldChain,X Layer" && NETWORKS.every((n) => lg.crChainLogo(n, coinFor(n)).glyph));
check("a plain 'Mainnet' is the coin's own chain (BTC is Bitcoin, LTC is Litecoin, DOGE is Dogecoin, ETH is Ethereum)", lg.crChainKey("Mainnet", "BTC") === "bitcoin" && lg.crChainKey("Mainnet", "LTC") === "litecoin" && lg.crChainKey("Mainnet", "DOGE") === "dogecoin" && lg.crChainKey("Mainnet", "ETH") === "ethereum" && lg.crChainKey("ETH Mainnet", "USDT") === "ethereum" && lg.crChainKey("Binance Smart Chain", "USDT") === "bsc" && lg.crChainKey("Polygon (Matic)", "USDC") === "polygon");
check("a network we have never heard of still gets a lettered circle, never a blank", lg.crChainLogo("Somenewchain", "USDT").glyph === "S" && lg.crChainLogo("Somenewchain", "USDT").uris.length === 0);

const sheet = read("src/components/dashboard/CryptorefillsProductSheet.tsx");
check("the Cryptorefills checkout lists every coin with every network up front, as Bitrefill does (no tap-a-coin-first step), each chip with the coin's logo and its network's logo", sheet.includes("<TokenChainLogo token={tokenLogo('USDC')} chain={chainLogo('base')} />") && sheet.includes("<TokenChainLogo token={tokenLogo('USDC')} chain={chainLogo('solana')} />") && sheet.includes("coinGroups.map(([coin, ms])") && sheet.includes("crTokenLogo(coin)") && sheet.includes("crChainLogo(m.network, coin)") && !sheet.includes("Network for ") && !sheet.includes("otherCoin") && !sheet.includes("coins.slice("));

// ── gift
check("Send as a Gift is offered for gift cards and eSIMs (a phone top-up is already for whichever number is entered)", sheet.includes("Send as a Gift") && sheet.includes("const giftable = !isTopup") && sheet.includes("{giftable ? (") && sheet.includes("A top-up is a gift whenever the number above belongs to someone else"));
check("a gift needs the recipient's name and a valid email, and the order is delivered to that email while the receipt stays with the buyer", sheet.includes("giftProblem(true, giftName, giftEmail)") && sheet.includes("const beneficiary = gifting ? giftEmail.trim()") && sheet.includes("order: buildOrder({ email, beneficiary,") && sheet.includes("label=\"Gift to\""));
const co = load("src/lib/cryptorefills-checkout.ts");
const item = { product_id: "p1", brand_name: "Netflix", denomination: "25", is_range: false, price_usdc: "25.4", country_code: "US" };
const giftOrder = co.buildOrder({ email: "buyer@b.co", beneficiary: "friend@b.co", item });
check("the order for a gift: the buyer's email on the order, the friend's as the beneficiary", giftOrder.email === "buyer@b.co" && giftOrder.items[0].beneficiary_account === "friend@b.co");
const bitSheet = read("src/components/dashboard/BitrefillProductSheet.tsx");
check("Bitrefill offers the same gift option on every kind of product (cards, top-ups, eSIMs, accounts)", bitSheet.includes("Send as a Gift") && !/kind === 'card'[^\n]*Send as a Gift/.test(bitSheet));

// ── the bottom menu
const theme = read("src/constants/theme.ts");
const hex = (name) => (new RegExp(`${name}: '(#[0-9A-Fa-f]{6})'`).exec(theme) || [])[1];
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const bg = hex("bg1");
check("the open tab is a lifted brand blue that reads on the dark bar (contrast at least 4.5:1; the plain blue was about 1.7:1), and the other tabs are bright", hex("blueBright") && contrast(hex("blueBright"), bg) >= 4.5 && contrast(hex("tx0"), bg) >= 10 && contrast(hex("blue"), bg) < 3, `${contrast(hex("blueBright"), bg).toFixed(1)}:1`);
const tabs = read("src/app/(tabs)/_layout.tsx");
check("the menu is a plain bar like a system one: bigger icons and labels, the open tab told apart by colour alone (no pill or box behind it), light inactive tabs, and a taller bar", tabs.includes("tabBarActiveTintColor: Colors.blueBright") && !tabs.includes("tabBarActiveBackgroundColor") && !tabs.includes("borderRadius: 16, marginHorizontal") && tabs.includes("tabBarInactiveTintColor: '#C9C8BD'") && tabs.includes("fontSize: 11.5") && !tabs.includes("Svg width={20}") && (tabs.match(/Svg width=\{24\}/g) || []).length === 4 && /BottomNavHeight = (7[0-9]|8[0-9])/.test(theme));

// ── chain and token logos, everywhere a chain is named
const logos = read("src/lib/payment-logos.ts");
check("Arc and Robinhood Chain have logos (they drew a letter circle before), and the two Cryptorefills coins CoinMarketCap had no id for (USDSC, USDm) have one too", logos.includes("arc: 'arc', robinhood: 'robinhood'") && logos.includes("USDSC:") && logos.includes("USDM:"));
const picker = read("src/components/dashboard/PaymentMethodPicker.tsx");
const wallet = read("src/components/dashboard/FundWalletSheet.tsx") + read("src/components/dashboard/WalletTabs.tsx");
check("the wallet sheet shows real network logos (tabs, Buy, Bridge from/to, balances) through ChainLabel instead of emoji text", picker.includes("export function ChainLabel") && (wallet.match(/<ChainLabel /g) || []).length >= 4 && !/\{(opt|d|n)\.icon\} \{(opt|d|n)\.label\}/.test(wallet));
const emojiChains = ["src/components/dashboard/HistorySection.tsx", "src/components/payment/PaymentConfirmSheet.tsx", "src/components/chat/ArcSendCard.tsx", "src/components/chat/BitrefillPaymentCard.tsx"].map(read).join("\n");
check("History rows, the payment confirm sheet, the Arc send card and the manual-send card draw network logos, not emoji (🔷 🟣 ◎ 🟡)", !/[🔷🟣◎🟡]/u.test(emojiChains) && read("src/components/dashboard/HistorySection.tsx").includes("netBadge"));
check("every 'Pay from another chain' link shows the five chains' logos, and the Cryptorefills checkout gives each chain its own tappable chip with its logo", picker.includes("export function MoreChainsLink") && picker.includes("export function ChainLogoStack") && read("src/components/dashboard/CryptorefillsProductSheet.tsx").includes("<TokenChainLogo token={chainLogo(c)} />"));

// ── the send arrow
const home = read("src/app/(tabs)/index.tsx");
const chat = read("src/components/chat/ChatSheet.tsx");
check("the send button is a drawn arrow (the ↑ text arrow rendered as letters), in both the Home ask bar and the chat sheet", home.includes("<SendIcon />") && !home.includes(">↑<") && chat.includes("<SendIcon />") && read("src/components/chat/SendIcon.tsx").includes("<Path"));

finish();
