/**
 * The Bills screens: the country list and its saved choice, product logos (the website's fallback chain), the Bitrefill and Cryptorefills
 * catalogs' rules, the purchase details, the voice error messages, and that the screens are wired the way the website's Bills screen is
 * (both providers under Browse, tappable history, a wallet tab row that scrolls sideways).
 *
 *     node scripts/tests/bills.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const read = (p) => fs.readFileSync(path.join(__dirname, "../..", p), "utf8");

// ── countries
const cn = makeLoader({})("src/lib/bills-countries.ts");
check("countries: the website's thirty, each with a code, name, flag and currency, and no code twice", cn.COUNTRIES.length === 30 && new Set(cn.COUNTRIES.map((c) => c.code)).size === 30 && cn.COUNTRIES.every((c) => /^[A-Z]{2}$/.test(c.code) && c.name && c.flag && /^[A-Z]{3}$/.test(c.currency)));
check("countries: Nigeria is NGN and the list starts with the United States (the default)", cn.getCountry("NG").currency === "NGN" && cn.COUNTRIES[0].code === "US");
check("countries: an unknown or missing code falls back to the United States; case doesn't matter", cn.getCountry("ZZ").code === "US" && cn.getCountry(undefined).code === "US" && cn.getCountry("ng").code === "NG");
check("countries: search finds by name, code or currency, and empty search lists all", cn.searchCountries("niger").map((c) => c.code).join() === "NG" && cn.searchCountries("EUR").length === 5 && cn.searchCountries("de")[0].code === "DE" && cn.searchCountries("  ").length === 30 && cn.searchCountries("zzzz").length === 0);

// ── the saved country (SecureStore stubbed)
{
  const store = new Map();
  let fail = false;
  const secure = { getItemAsync: async (k) => (fail ? Promise.reject(new Error("no")) : store.get(k) ?? null), setItemAsync: async (k, v) => (fail ? Promise.reject(new Error("no")) : void store.set(k, v)) };
  const react = { useEffect: () => {}, useSyncExternalStore: (sub, get) => get() };
  const mod = makeLoader({ "expo-secure-store": secure, react })("src/lib/bills-country.ts");
  (async () => {
    check("saved country: starts as the United States", mod.currentBillsCountry().code === "US");
    store.set("bluvfi.bills-country", "NG");
    const loaded = await mod.loadBillsCountry();
    check("saved country: loads what was saved last time", loaded.code === "NG" && mod.currentBillsCountry().code === "NG");
    mod.setBillsCountry(cn.getCountry("KE"));
    await new Promise((r) => setTimeout(r, 5));
    check("saved country: choosing one applies at once and is saved", mod.currentBillsCountry().code === "KE" && store.get("bluvfi.bills-country") === "KE");
    fail = true;
    mod.setBillsCountry(cn.getCountry("GH"));
    await new Promise((r) => setTimeout(r, 5));
    check("saved country: a storage failure doesn't stop the choice applying for this session", mod.currentBillsCountry().code === "GH");
    finishAsync();
  })();
}

// ── logos: the website's fallback chain
const lg = makeLoader({})("src/lib/bills-logos.ts");
check("logos: a Bitrefill product gets the official Bitrefill logo, even when the API sent another", lg.bitrefillLogoUrl({ name: "Bitrefill Gift Card (USD)", logo_url: "https://x.example/a.png" }) === lg.BITREFILL_OFFICIAL_LOGO);
check("logos: otherwise the logo the API sent wins over a favicon", lg.bitrefillLogoUrl({ name: "Netflix", logo_url: "https://x.example/netflix.png" }) === "https://x.example/netflix.png");
check("logos: with no API logo, a known brand gets its Google favicon", lg.bitrefillLogoUrl({ name: "Netflix US" }) === "https://www.google.com/s2/favicons?domain=netflix.com&sz=128" && lg.bitrefillLogoUrl({ name: "MTN Nigeria" }).includes("domain=mtn.com"));
check("logos: an unknown brand gets none, so the emoji shows", lg.bitrefillLogoUrl({ name: "Zxqv Unknown Shop" }) === undefined && lg.bitrefillLogoUrl({}) === undefined);
check("logos: the brand map is the website's (a hundred brands) and every entry is a real domain", Object.keys(lg.BRAND_DOMAIN).length >= 100 && Object.values(lg.BRAND_DOMAIN).every((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)));
check("logos: the emoji fallback depends on the section", lg.productEmoji("esim") === "📡" && lg.productEmoji("topup") === "📱" && lg.productEmoji("cards") === "🎁");
check("logos: the Cryptorefills logo is served over https", /^https:\/\/www\.bluvfi\.xyz\/cryptorefills-logo\.png$/.test(lg.CRYPTOREFILLS_LOGO));

// ── Bitrefill catalog rules
const bc = makeLoader({})("src/lib/bitrefill-catalog.ts");
check("catalog: the sections ask for their own category, gift cards ask for the chosen filter and 'All' sends none", bc.catalogCategory("topup", "gaming") === "topup" && bc.catalogCategory("esim", "all") === "esim" && bc.catalogCategory("cards", "gaming") === "gaming" && bc.catalogCategory("cards", "all") === undefined);
check("catalog: the filters are the website's seven, with 'vpn' shown as Privacy", bc.CARD_FILTERS.map((f) => f.key).join() === "all,entertainment,gaming,shopping,food,vpn,travel" && bc.CARD_FILTERS.find((f) => f.key === "vpn").label === "Privacy");
check("catalog: prices read as a range from the packages, a single price when they're all the same", bc.priceRange({ id: "1", name: "x", category: "c", packages: [{ price_usd: 5 }, { price_usd: 100 }, { price_usd: 25 }] }) === "$5–$100" && bc.priceRange({ id: "1", name: "x", category: "c", packages: [{ price_usd: 10 }] }) === "$10");
check("catalog: a range product is priced from its rate, or shown in its own currency without one, and no price at all is null", bc.priceRange({ id: "1", name: "x", category: "c", range: { min: 100, max: 500, price_rate: 0.0006 } }) === "$0.06–$0.30" && bc.priceRange({ id: "1", name: "x", category: "c", currency: "NGN", range: { min: 100, max: 500 } }) === "NGN 100–NGN 500" && bc.priceRange({ id: "1", name: "x", category: "c" }) === null);
check("catalog: the subtitle and the button say what the product is", bc.productSubtitle({ id: "1", name: "x", category: "streaming-video", currency: "USD" }, "cards") === "Streaming Video · USD" && bc.productSubtitle({ id: "1", name: "x", category: "c" }, "topup") === "Mobile top-up" && bc.productSubtitle({ id: "1", name: "x", category: "c", recipient_type: "esim" }, "cards") === "Data plan"
  && bc.buyVerb({ id: "1", name: "x", category: "c" }, "topup") === "Refill" && bc.buyVerb({ id: "1", name: "x", category: "c" }, "esim") === "Get Plan" && bc.buyVerb({ id: "1", name: "x", category: "c" }, "cards") === "Buy");

// ── Cryptorefills grouping (the website's rules)
const cr = makeLoader({})("src/lib/cryptorefills-categories.ts");
const B = (brand_name, category, extra = {}) => ({ brand_name, family: brand_name, category, ...extra });
check("cryptorefills: eSIMs, mobile products and gift cards are told apart, and e-money is left out", cr.kindOf("e-sim") === "esim" && cr.kindOf("mobile_data") === "topup" && cr.kindOf("mobile_talk_time") === "topup" && cr.kindOf("streaming") === "cards" && cr.kindOf("e-money") === null);
check("cryptorefills: gift cards fall into the website's filters, with VPNs and password managers as Privacy and charity only under All", cr.cardCategoryOf(B("Netflix", "streaming")) === "entertainment" && cr.cardCategoryOf(B("Steam", "games")) === "gaming" && cr.cardCategoryOf(B("Uber Eats", "food")) === "food" && cr.cardCategoryOf(B("Emirates", "travel_flights")) === "travel" && cr.cardCategoryOf(B("Amazon", "e-commerce")) === "shopping" && cr.cardCategoryOf(B("NordPass", "electronics")) === "vpn" && cr.cardCategoryOf(B("UNICEF", "charity_donations")) === null);
check("cryptorefills: a brand the catalogue repeats is listed once", cr.dedupeBrands([B("NordPass", "x"), B("NordPass", "x"), B("Netflix", "x")]).length === 2);
const sample = [B("Netflix", "streaming"), B("Steam", "games"), B("NordVPN", "electronics"), B("MTN Nigeria", "mobile_data"), B("Airalo", "e-sim"), B("Netflix", "streaming"), B("UNICEF", "charity_donations")];
const vis = (o) => cr.visibleBrands(sample, o).map((b) => b.brand_name).join();
check("cryptorefills: each section lists its own brands, once", vis({ kind: "cards", cardFilter: "all", query: "" }) === "Netflix,Steam,NordVPN,UNICEF" && vis({ kind: "topup", cardFilter: "all", query: "" }) === "MTN Nigeria" && vis({ kind: "esim", cardFilter: "all", query: "" }) === "Airalo");
check("cryptorefills: the gift-card filter and the search narrow the list (the filter only applies to gift cards)", vis({ kind: "cards", cardFilter: "gaming", query: "" }) === "Steam" && vis({ kind: "cards", cardFilter: "vpn", query: "" }) === "NordVPN" && vis({ kind: "cards", cardFilter: "all", query: "net" }) === "Netflix" && vis({ kind: "topup", cardFilter: "gaming", query: "" }) === "MTN Nigeria");
check("cryptorefills: the emoji and pretty category names", cr.categoryEmoji("e-sim") === "📡" && cr.categoryEmoji("nope") === "🎁" && cr.prettyCategory("travel_flights") === "Travel Flights");

// ── purchase details
const pd = makeLoader({})("src/lib/purchase-detail.ts");
check("purchase: a description is split into the product and how it was paid", JSON.stringify(pd.parsePurchase("Purchased Netflix via usdc_base")) === JSON.stringify({ title: "Netflix", method: "USDC · Base" }) && pd.parsePurchase("Card funding").title === "Card funding" && pd.parsePurchase(null).title === "Digital product" && pd.parsePurchase("Purchased MTN Nigeria").method === undefined);
check("purchase: statuses read plainly, and anything unknown is 'In progress'", pd.statusInfo("completed").label === "Completed" && pd.statusInfo("complete").tone === "success" && pd.statusInfo("failed").tone === "danger" && pd.statusInfo("expired").label === "Expired" && pd.statusInfo("pending").label === "In progress" && pd.statusInfo("processing").tone === "pending");
const orders = [{ invoiceId: "inv-1", redemptionCode: "AAAA-BBBB" }, { invoiceId: "inv-2", redemptionCode: null }];
check("purchase: the order for a payment is found by its reference, and none without one", pd.findOrder(orders, { referenceId: "inv-2" }).invoiceId === "inv-2" && pd.findOrder(orders, { referenceId: "nope" }) === null && pd.findOrder(orders, { referenceId: null }) === null && pd.findOrder(undefined, { referenceId: "inv-1" }) === null);
const h = "0x" + "ab".repeat(32);
check("purchase: an EVM transaction links to the right explorer for its network, and not at all when the network isn't known", pd.explorerUrl({ chain: "evm", txHash: h, description: "Purchased X via usdc_base" }) === `https://basescan.org/tx/${h}` && pd.explorerUrl({ chain: "evm", txHash: h, description: "Purchased X via usdc_polygon" }).startsWith("https://polygonscan.com/tx/") && pd.explorerUrl({ chain: "evm", txHash: h, description: "Purchased X" }) === null);
const sig = "5".repeat(88);
check("purchase: Solana and XRP transactions link to their explorers; a malformed hash is never linked", pd.explorerUrl({ chain: "solana", txHash: sig, description: null }) === `https://solscan.io/tx/${sig}` && pd.explorerUrl({ chain: "xrpl", txHash: "AB".repeat(32), description: null }).startsWith("https://livenet.xrpl.org/transactions/") && pd.explorerUrl({ chain: "evm", txHash: "0x123", description: "Purchased X via usdc_base" }) === null && pd.explorerUrl({ chain: "solana", txHash: "javascript:alert(1)", description: null }) === null && pd.explorerUrl({ chain: "evm", txHash: null, description: null }) === null);
check("purchase: long ids are shortened and the question to the assistant names the purchase and its status", pd.shortId("0123456789abcdefghij") === "01234567…efghij" && pd.shortId("short") === "short" && pd.shortId(null) === "" && /Netflix/.test(pd.askAboutPurchase({ description: "Purchased Netflix via usdc_base", status: "failed", createdAt: "2026-10-03T10:00:00Z" })) && /failed/.test(pd.askAboutPurchase({ description: "Purchased Netflix", status: "failed", createdAt: "2026-10-03T10:00:00Z" })));

// ── voice error wording
const ve = makeLoader({})("src/lib/voice-errors.ts");
check("voice: a rate-limit answer is shown as the server wrote it, other refusals show the server's words and the status", ve.voiceFailureMessage(429, "You've reached your daily voice limit.") === "You've reached your daily voice limit." && ve.voiceFailureMessage(502, "Transcription failed. Please try again.") === "Transcription failed. Please try again. (502)" && ve.voiceFailureMessage(500, "Voice transcription not configured") === "Voice transcription not configured. Please try again. (500)");
check("voice: no server message still gives a status, and an expired session says to log in", ve.voiceFailureMessage(400) === "Couldn't transcribe that. Please try again. (400)" && /Log in again/.test(ve.voiceFailureMessage(401, "Unauthorized")));
check("voice: a dead connection says so, and any other failure says the recording couldn't be sent", /Check your connection/.test(ve.voiceNetworkMessage(new TypeError("Network request failed"))) && /Check your connection/.test(ve.voiceNetworkMessage(new Error("timeout"))) && /couldn't send that recording/i.test(ve.voiceNetworkMessage(new Error("ENOENT file"))));
check("voice: the hook uses these messages and still logs what happened", /voiceFailureMessage\(res\.status, data\.error\)/.test(read("src/hooks/use-voice-input.ts")) && /voiceNetworkMessage\(err\)/.test(read("src/hooks/use-voice-input.ts")) && /\[voice\] the server answered/.test(read("src/hooks/use-voice-input.ts")));

// ── the screens
const parts = read("src/components/dashboard/CatalogParts.tsx");
const wallet = read("src/components/dashboard/FundWalletSheet.tsx");
check("scrolling: the catalog's pill and chip rows and the wallet's tab row use the gesture-handler ScrollView (a plain one doesn't scroll sideways inside a bottom sheet on Android)", /import \{ ScrollView \} from 'react-native-gesture-handler'/.test(parts) && /import \{ ScrollView \} from 'react-native-gesture-handler'/.test(wallet) && !/import \{[^}]*\bScrollView\b[^}]*\} from 'react-native';/.test(wallet) && !/import \{[^}]*\bScrollView\b[^}]*\} from 'react-native';/.test(parts));
const sections = read("src/components/dashboard/DashboardSections.tsx");
check("Bills > Browse lists both providers, with the website's badges", /onOpenBitrefill/.test(sections) && /onOpenCryptorefills/.test(sections) && sections.includes("USDC · No gas") && sections.includes(">Bitrefill<") && sections.includes(">Cryptorefills<") && sections.includes("10,000+ brands in 180 countries"));
const home = read("src/app/(tabs)/index.tsx");
check("Home opens the Cryptorefills sheet from Browse and hands a chosen product to the assistant with its country", /<CryptorefillsCatalogSheet/.test(home) && /onOpenCryptorefills=\{\(\) => setCryptorefillsOpen\(true\)\}/.test(home) && /from Cryptorefills for \$\{countryName\}/.test(home) && /from Bitrefill for \$\{countryName\}/.test(home));
const row = read("src/components/dashboard/PurchaseRow.tsx");
const sheet = read("src/components/dashboard/PurchasesSheet.tsx");
check("history: a purchase row is tappable and opens its details, from the recent list and the full history", /<Pressable onPress=\{onPress\}/.test(row) && /onPress=\{\(\) => onSelect\(p\)\}/.test(sheet) && /onOpenPurchase/.test(sections) && /setSelectedPurchase\(p\)/.test(home));
check("history: the details show the code with a copy button and the eSIM link, from the order record linked by the payment's reference", /\/api\/bitrefill\/orders/.test(sheet) && /Copy code/.test(sheet) && /Open install link/.test(sheet) && /findOrder\(orders\.data\?\.orders, payment\)/.test(sheet));
const bsheet = read("src/components/dashboard/BitrefillCatalogSheet.tsx");
check("Bitrefill catalog: browsed for the chosen country with the website's layout (summary card, country button, pills, filter chips, search, logo rows)", /country: country\.code/.test(bsheet) && /catalogCategory\(tab, filter\)/.test(bsheet) && /<SummaryCard/.test(bsheet) && /<CountrySelector/.test(bsheet) && /<TabPills/.test(bsheet) && /<FilterChips/.test(bsheet) && /bitrefillLogoUrl\(p\)/.test(bsheet));
const csheet = read("src/components/dashboard/CryptorefillsCatalogSheet.tsx");
check("Cryptorefills catalog: brands for the chosen country from the website's API, drawn with their logo on their own colour", /\/api\/cryptorefills\/brands/.test(csheet) && /country: country\.code\.toLowerCase\(\)/.test(csheet) && /background=\{b\.bg_color/.test(csheet) && /fit="contain"/.test(csheet) && /visibleBrands\(/.test(csheet));

let done = false;
function finishAsync() {
  if (done) return;
  done = true;
  finish();
}
