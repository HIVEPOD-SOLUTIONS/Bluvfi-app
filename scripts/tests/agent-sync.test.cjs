/**
 * The AI agent and the app stay in step (needs the web repo next to this one): every tool the agent has for Shar and the open provider
 * network is described in its prompt and has a card in the chat; every bluvfi:// link the agent can produce opens a real screen; and
 * the things the agent says the app can do are things the app really has. If a feature is added on one side and not the other, this fails.
 *
 *     node scripts/tests/agent-sync.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { reporter, makeLoader } = require("./_harness.cjs");
const { check, finish } = reporter();

const web = path.join(__dirname, "../../../bluvfi");
const app = path.join(__dirname, "../..");
if (!fs.existsSync(path.join(web, "src/lib/ai/network-tools.ts"))) {
  console.log("SKIP agent-sync: the web repo isn't next to this one");
  process.exit(0);
}
const read = (root, p) => fs.readFileSync(path.join(root, p), "utf8");
const tools = read(web, "src/lib/ai/network-tools.ts");
const prompt = read(web, "src/lib/ai/system-prompt.ts");
const toolsIndex = read(web, "src/lib/ai/tools.ts");
const cards = read(app, "src/components/chat/ToolResultCard.tsx");
const bubble = read(app, "src/components/chat/MessageBubble.tsx");

// ── tools ↔ prompt ↔ cards
const toolNames = [...tools.matchAll(/^    ([a-z_]+): tool\(\{/gm)].map((m) => m[1]);
check("the agent has the five read-only Shar and network tools", toolNames.sort().join() === "get_my_activity,get_my_network_account,get_my_shar,get_provider_details,search_network_providers", toolNames.join());
for (const t of toolNames) {
  check(`${t}: the prompt tells the agent when to use it`, prompt.includes(t));
  check(`${t}: the app shows its answer as a card`, cards.includes(`toolName === '${t}'`));
}
check("none of the agent's tools can change anything (no mutations in the file)", !/\b(insert|update|delete)\b\s*\(/.test(tools) && !/\b(createClaim|requestWithdrawal|payPayout|creditTopup|updateListing|ownerAction|reviewListing|submitListing|createListing)\b/.test(tools.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
check("the tools are registered for the mobile app only", /client === "expo-android" \? createNetworkTools\(userId\) : \{\}/.test(toolsIndex));

// ── links the agent can emit ↔ screens the app opens
const appLinks = new Set([...bubble.matchAll(/'(bluvfi:\/\/[a-z]+)':/g)].map((m) => m[1]));
const emitted = new Set(
  [...(prompt + tools).matchAll(/bluvfi:\/\/([a-z]+)/g)].map((m) => m[0]).filter((l) => l !== "bluvfi://provider"),
);
const missing = [...emitted].filter((l) => !appLinks.has(l));
check("every screen link the agent can give opens a screen in the app", missing.length === 0, `missing: ${missing.join(", ")}`);
check("provider links (bluvfi://provider/<id>) are handled too", /PROVIDER_LINK/.test(bubble) && /provider\/\(/.test(bubble.replace(/\\/g, "")));
{
  // every row of the profile that a person can tap is something the agent knows about, so it can say where to find things
  const profile = fs.readFileSync(path.join(app, "src/components/profile/ProfileContent.tsx"), "utf8");
  const rows = [...profile.matchAll(/<Text style=\{styles\.sharTitle\}>([^<{]+)<\/Text>/g)].map((m) => m[1].trim()).filter((t) => t !== "Admin");
  const named = (t) => prompt.includes(t) || prompt.includes(t.replace("&", "and")) || (t === "Help & FAQ" && prompt.includes("Help & FAQ"));
  check("every profile row (except the team-only Admin) is described in the agent's prompt: " + rows.join(", "), rows.length >= 4 && rows.every(named), rows.filter((t) => !named(t)).join(", "));
  check("the prompt never links to an Admin screen", !prompt.includes("bluvfi://admin") && !/\]\(bluvfi:\/\/admin/i.test(prompt));
}
const routes = new Set(["/crypto", "/profile", "/", "/shar", "/network", "/faq", "/activity", "/creator", "/invite", "/spark"]);
const targets = [...bubble.matchAll(/'bluvfi:\/\/[a-z]+': '([^']+)'/g)].map((m) => m[1]);
check("every link target is a real screen file", targets.every((t) => routes.has(t) && (t === "/" || ["crypto", "profile", "shar", "network"].includes(t.slice(1)) ? true : fs.existsSync(path.join(app, "src/app", t.slice(1) + ".tsx")))), targets.join());

// ── what the prompt says the app has, the app really has
const facts = [
  ["a full-screen add/edit form", "src/app/provider/new.tsx"],
  ["editing a provider", "src/app/provider/edit/[id].tsx"],
  ["the Help & FAQ page", "src/app/faq.tsx"],
  ["the Activity page", "src/app/activity.tsx"],
  ["Convert to USDC", "src/components/shar/ConvertSkrSheet.tsx"],
  ["the SKR switch", "src/components/shar/SpendSkrCard.tsx"],
];
for (const [what, file] of facts) check(`the app has ${what} (${file})`, fs.existsSync(path.join(app, file)));
const form = read(app, "src/components/shar/ProviderFormScreen.tsx");
for (const [phrase, inForm] of [
  ["What people send", 'title="What people send"'],
  ["Before it can be used", 'title="Before it can be used"'],
  ["Connect your API", 'title="Connect your API"'],
  ["Notes for the Bluvfi team", 'title="Notes for the Bluvfi team"'],
  ["Become a creator", "pathname: '/creator'"],
  ["Copy setup from another provider", 'title="Copy setup from another provider"'],
  ["Your terms for people who use it", 'title="Your terms for people who use it"'],
]) check(`the prompt's name for a form section exists in the form: "${phrase}"`, prompt.includes(phrase) && form.includes(inForm));
check("the prompt's wording for the checkbox matches the app's", prompt.includes("I've done this") && read(app, "src/app/provider/[id].tsx").includes("I’ve done this"));
check("the prompt's wording for the switch matches the app's", prompt.includes("Use my SKR when I'm short on USDC") && read(app, "src/components/shar/SpendSkrCard.tsx").includes("Use my SKR when I’m short on USDC"));
check("the agent is told never to ask for an API key in chat", prompt.includes("Never ask for or repeat an API key in chat"));
check("the agent is told it cannot move SKR, claim, add credits or change a listing", prompt.includes("You cannot convert or move SKR for them") && prompt.includes("You cannot claim Shar, withdraw commission, add credits, call a provider or change a listing"));
{
  // What the prompt tells people to do on the money screens is what those screens really ask for.
  const claim = read(app, "src/components/shar/ClaimSheet.tsx");
  const earn = read(app, "src/components/shar/EarningsCard.tsx");
  const credits = read(app, "src/components/shar/AddCreditsSheet.tsx");
  const ref = read(app, "src/components/shar/ReferralCodeSheet.tsx");
  check("claiming: the sheet asks for an amount and a Solana address and warns the address can't be recovered, as the prompt says", prompt.includes("Claiming Shar:") && claim.includes("Solana wallet to receive it") && claim.includes("can’t be recovered") && prompt.includes("can't be recovered"));
  check("withdrawing: the card asks for a Solana address, is paid as SKR priced when sent, and blocks a second one, as the prompt says", prompt.includes("Withdrawing commission") && earn.includes("Withdraw as SKR") && earn.includes("Paid in SKR, priced when we send it") && earn.includes("You have a withdrawal in progress"));
  check("adding credits: one-tap send from the Bluvfi wallet, or send from anywhere and paste the signature, as the prompt says", prompt.includes("Adding credits") && credits.includes("sendFromBluvfi") && credits.includes("paste the transaction signature") && credits.includes("That deposit was credited before"));
  check("referral code: the sheet says 8 letters and numbers and that it's applied when the account is created, as the prompt says", prompt.includes("8 letters and numbers") && ref.includes("8 letters and numbers") && ref.includes("when you create your account"));
}
{
  // Bills, Invest, Crypto, wallets: what the prompt says the screens are is what they are.
  const fund = read(app, "src/components/dashboard/FundWalletSheet.tsx");
  const invest = read(app, "src/components/invest/InvestScreen.tsx");
  const coin = read(app, "src/components/crypto/CoinSheet.tsx");
  const cryptoTab = read(app, "src/app/(tabs)/crypto.tsx");
  const bills = read(app, "src/components/dashboard/DashboardSections.tsx");
  const bitrefill = read(app, "src/lib/bitrefill-catalog.ts");
  const home = read(app, "src/app/(tabs)/index.tsx");
  const minFund = /const MIN_FUND_AMOUNT = (\d+)/.exec(fund)?.[1];
  check("Fund Wallet: the tabs, the minimum and the networks the prompt lists are the real ones", ["Buy", "Balances", "Send", "Bridge", "Solana"].every((t) => fund.includes(`label: '`) && fund.includes(t)) && minFund === "11" && prompt.includes(`$${minFund} minimum`) && ["Base", "Ethereum", "Arbitrum", "Optimism", "Polygon", "Avalanche", "Solana"].every((n) => fund.includes(`label: '${n}'`) && prompt.includes(n)));
  check("Invest: the view names, filter chips and provider cards the prompt lists exist", ["My Portfolio", "Market"].every((x) => invest.includes(x)) && ["All", "Stocks", "Pre-IPO", "ETFs"].every((x) => invest.includes(`label: '${x}'`) && prompt.includes(x)) && ["Backpack", "GetEquity"].every((x) => invest.includes(`name="${x}"`) && prompt.includes(x)));
  check("Invest: the screen lists only Backpack and GetEquity (Nosana, Doma and Crypto Trading are behind SHOW_EXTRA_PROVIDERS), and the prompt does not send people to cards that are not there", invest.includes("SHOW_EXTRA_PROVIDERS = false") && invest.includes("SHOW_EXTRA_PROVIDERS && (filter === 'crypto'") && !prompt.includes("filter chips All, Stocks, Pre-IPO, ETFs and Crypto Trading") && !prompt.includes("Market cards are Backpack (US stocks and ETFs, 1,100+, fractional shares, USDC), GetEquity (private markets, needs a real KYC-approved account), Nosana"));
  const crTools = read(web, "src/lib/ai/cryptorefills-tools.ts");
  const crSheet = read(app, "src/components/dashboard/CryptorefillsProductSheet.tsx");
  const biSheet = read(app, "src/components/dashboard/BitrefillProductSheet.tsx");
  check("Gift: the app offers Send as a Gift on Bitrefill and Cryptorefills, and the agent can do the same (Cryptorefills giftToEmail, Bitrefill recipient email) and says stocks and equity cannot be gifted", crSheet.includes("Send as a Gift") && biSheet.includes("Send as a Gift") && crTools.includes("giftToEmail") && crTools.includes("giftToEmail ?? email") && toolsIndex.includes("pass the RECIPIENT's email") && prompt.includes("Send as a Gift") && prompt.includes("giftToEmail") && prompt.includes("cannot be sent as gifts"));
  check("Invest: there is no xStocks or gold screen, as the prompt says (so it never tells people to buy them here)", !/xstocks|oro|grail/i.test(invest) && prompt.includes("There is no screen for xStocks or for Oro gold"));
  check("Crypto tab: search and the 24H/7D/30D/1Y chart ranges the prompt lists exist, and it has no buy or sell", cryptoTab.includes("Search coin name or ticker") && ["24H", "7D", "30D", "1Y"].every((r) => coin.includes(`key: '${r}'`) && prompt.includes(r)) && !/Buy|Sell/.test(coin.replace(/Buy USDC/g, "")));
  check("Bills: My Bills / Browse and the catalog names the prompt lists exist", bills.includes("My Bills") && bills.includes("Browse") && ["Gift Cards", "Phone Refills", "eSIM Data"].every((x) => bitrefill.includes(`label: '${x}'`) && prompt.includes(x)));
  check("XRP: the app has no XRP card on Home (the wallet is created automatically and shown in Profile), as the prompt says", !/XRP card|xrp-card|XrpCard/i.test(home) && read(app, "src/components/profile/ProfileContent.tsx").includes("XRPL WALLET") && prompt.includes("Ignore advice above to"));
  check("Savings goals: the app has no goals screen, so the prompt says not to create them here", !fs.readdirSync(path.join(app, "src/app")).some((f) => /goal/i.test(f)) && !fs.existsSync(path.join(app, "src/hooks/use-goals.ts")) && prompt.includes("Don't create or delete goals in the app"));
  check("Banking: the app never opens the on/off-ramp sheets, so 'coming soon' stays true", !["src/app", "src/components/dashboard", "src/components/invest", "src/components/chat"].some((d) => fs.readdirSync(path.join(app, d), { recursive: true }).filter((f) => /\.tsx$/.test(f)).some((f) => /OnrampSheet|OfframpSheet/.test(fs.readFileSync(path.join(app, d, f), "utf8")))));
}
{
  // Chat limits, ads, voice, notifications, context: the prompt matches the server's limits and what the app really has.
  const limiter = read(web, "src/lib/user-rate-limiter.ts");
  const chat = /checkChatLimit[\s\S]*?isPremium \? \d+ : \d+,\s*60_000,\s*isPremium \? (\d+) : (\d+),/.exec(limiter);
  const voice = /checkVoiceLimit[\s\S]*?isPremium \? \d+ : \d+,\s*60_000,\s*isPremium \? (\d+) : (\d+),/.exec(limiter);
  const n = (x) => Number(x).toLocaleString("en-US");
  check("chat limits: the free and Premium daily numbers in the prompt are the server's, and the window is rolling 24h (not midnight)", !!chat && prompt.includes(`${chat[2]} messages per rolling 24 hours (${n(chat[1])} with Bluvfi Premium)`) && limiter.includes("rolling 24-hour window") && !prompt.includes("midnight UTC"));
  check("voice limits: the numbers in the prompt are the server's", !!voice && prompt.includes(`${voice[2]} transcriptions a day (${voice[1]} with Premium)`));
  const sheet = read(app, "src/components/chat/ChatSheet.tsx");
  const pkg = read(app, "package.json");
  check("ads: the rewarded button says what the prompt says, Premium has no ad button, and the prompt knows the successful-payment interstitial (free accounts only, with its cooldown)", sheet.includes("Watch Ad — Get More Messages") && prompt.includes('"Watch Ad — Get More Messages"') && sheet.includes("{!isPremium && (") && read(app, "src/lib/admob.ts").includes("Interstitial") && prompt.includes("free accounts see a short full-screen ad after a successful payment") && prompt.includes("Bluvfi Premium never sees it") && prompt.includes("about once every 30 seconds") && !prompt.includes("no interstitial ads after purchases"));
  {
    const appJson = JSON.parse(read(app, "app.json"));
    const adPlugin = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === "react-native-google-mobile-ads");
    // Expo warns that the root-level key is "ignored", but the ads library's own Gradle build reads its app id from it: without it the Android
    // build stops with "Cannot get property 'googleMobileAdsJson'". So it stays, and must match the plugin's id.
    check("ads: the AdMob app id is in the Expo plugin AND the root-level key the library's Android Gradle build reads (both the same id)", adPlugin && adPlugin[1].androidAppId === "ca-app-pub-4986320440788963~9278420291" && appJson["react-native-google-mobile-ads"] && appJson["react-native-google-mobile-ads"].android_app_id === "ca-app-pub-4986320440788963~9278420291");
  }
  check("sound: the prompt describes Shar's voice (varied phrases, richer ones for Seekers, creators only)", prompt.includes("a short musical phrase") && prompt.includes("Seekers have their own richer ones"));
  {
    // every screen a person can open from the app has a link the assistant may use, so a new screen can't be forgotten
    const screens = fs.readdirSync(path.join(app, "src/app")).filter((n) => n.endsWith(".tsx") && !n.startsWith("_")).map((n) => n.replace(".tsx", ""));
    const internal = new Set(["login", "onboarding", "oauth-callback", "provider"]);
    const need = screens.filter((n) => !internal.has(n));
    const missing = need.filter((n) => !prompt.includes("bluvfi://" + n));
    check("every screen in the app (" + need.join(", ") + ") has a bluvfi:// link in the prompt", missing.length === 0, "missing: " + missing.join(", "));
  }
  check("ads: the cooldown the prompt names is the one the app uses", read(app, "src/lib/admob.ts").includes("INTERSTITIAL_COOLDOWN_MS = 30_000"));
  check("bills: the prompt describes the product pages (description, how to redeem, reviews, token/chain payment choices) for both providers", prompt.includes("opens its own page in the app") && prompt.includes("accepted payment methods, reviews and terms") && prompt.includes("accepted token and chain") && prompt.includes("shows its exact deposit address, amount and a QR") && prompt.includes("each with its logo") && prompt.includes("Cryptorefills works the same way"));
  check("bills: the prompt knows the Bitrefill page uses the web-like checkout stages", ["Top-up details", "Delivery details", "Send as a Gift", "Pay with chips", "Sending to", "Receipt to", "Code sent to"].every((t) => prompt.includes(t)));
  check("notifications: opt-in reminders and alerts (a switch on the Spark screen, off until turned on); alerts come from the phone checking the server's inbox, with no push service, and the prompt says exactly that", pkg.includes("expo-notifications") && pkg.includes("expo-background-task") && prompt.includes("Notifications are opt-in") && prompt.includes("Reminders and alerts") && read(app, "src/app/spark.tsx").includes("Reminders and alerts") && read(app, "src/lib/reminders.ts").includes("scheduleNotificationAsync") && read(app, "src/lib/inbox-poll.ts").includes("/api/notifications/inbox") && read(web, "src/lib/inbox.ts").includes("notification_inbox") && prompt.includes("not instant") && prompt.includes("There is no Firebase or other push service behind it") && prompt.includes("never carries amounts") && !/getExpoPushTokenAsync|getDevicePushTokenAsync/.test(read(app, "src/lib/reminders.ts")));
  {
    // Squads, weekly prizes and the widget: what the prompt says is what the code does
    const sq = makeLoader({}, web)("src/lib/shar-squad-rules.ts");
    check("squads: the prompt's numbers (10 people, 50 Shar each, at least 100, 2 to 24 letters, a 6-character code) are the server's", prompt.includes("up to 10 friends") && prompt.includes("50 Shar per member, at least 100") && prompt.includes("2 to 24 letters or numbers") && prompt.includes("6-character code") && sq.SQUAD.maxMembers === 10 && sq.SQUAD.goalPerMember === 50 && sq.SQUAD.minGoal === 100 && sq.SQUAD.nameMin === 2 && sq.SQUAD.nameMax === 24 && sq.SQUAD.codeLength === 6);
    check("squads: the agent can read the user's squad (get_my_shar), is told it can't start or join one, and the prompt says strangers only see a generated name", tools.includes("squad: await squadFor(userId)") && prompt.includes("You cannot start, join or leave a squad") && prompt.includes("generated name") && read(app, "src/components/shar/SquadCard.tsx").includes("SQUADS THIS WEEK"));
    check("squads: reaching the goal pays nothing extra, and the prompt does not promise otherwise", prompt.includes("recognition only: it pays no extra Shar") && !read(web, "src/lib/shar-squads.ts").includes("insert into shar_sparks") && !read(web, "src/lib/shar-squads.ts").includes("shar_weekly_awards"));
    const sparkRules = makeLoader({}, web)("src/lib/shar-spark-rules.ts");
    check("prizes: the prompt's amounts (1st 50, 2nd 30, 3rd 20, at least 20 Shar earned) are the server's, and the agent reads the live list from get_my_shar", JSON.stringify(sparkRules.WEEKLY_PRIZE_SHAR) === "[50,30,20]" && sparkRules.WEEKLY_PRIZE_MIN_SHAR === 20 && prompt.includes("1st 50, 2nd 30, 3rd 20") && prompt.includes("at least 20 Shar that week") && prompt.includes("as Shar they claim as SKR the usual way") && prompt.includes("never promise a prize it doesn't list") && tools.includes("prizes: board.prizes") && read(app, "src/components/shar/WeeklyBoard.tsx").includes("win Shar this week"));
    check("widget: the prompt describes the Daily Spark home-screen widget and the build declares it", prompt.includes("home-screen widget") && prompt.includes("Widgets, then Daily Spark") && read(app, "app.json").includes('"label": "Daily Spark"'));
  }
  {
    // Daily Spark: the numbers the prompt gives are the server's own
    const sr = makeLoader({}, web)("src/lib/shar-spark-rules.ts");
    const pay = (d, seeker) => sr.sparkReward(d, seeker).shar;
    check("Daily Spark: the prompt's amounts (2, 3, 4, +10 on the 7th day, x1.5 for a Seeker holder, midnight UTC) are what the server pays", prompt.includes("Days 1 and 2 pay 2 Shar") && prompt.includes("days 3 to 6 pay 3") && prompt.includes("day 7 onwards pay 4") && prompt.includes("adds a 10 Shar bonus") && prompt.includes("x1.5 on the day and on the bonus") && prompt.includes("resets at 00:00 UTC") && pay(1, false) === 2 && pay(2, false) === 2 && pay(3, false) === 3 && pay(6, false) === 3 && pay(8, false) === 4 && pay(7, false) === 14 && sr.SPARK.seekerMultiplier === 1.5);
    check("Daily Spark: the Seeker boost is checked on the server (never trusted from the app), and the prompt says so", web && read(web, "src/lib/shar.ts").includes("isSeekerHolder(userId)") && read(web, "src/lib/seeker-sgt.ts").includes("getUserWalletAddresses") && prompt.includes("checked on the server when they collect"));
    check("Daily Spark: the agent can read the streak and the badges (get_my_shar), and knows every badge the app shows", tools.includes("dailySpark:") && tools.includes("badges: s.badges") && sr.BADGES.every((b) => prompt.includes(b.label.replace(" streak", "")) || prompt.includes(b.label)), sr.BADGES.filter((b) => !(prompt.includes(b.label.replace(" streak", "")) || prompt.includes(b.label))).map((b) => b.label).join());
    {
    // Arc, Tempo, Robinhood Chain, Zcash and Hyperliquid: every tool the app is given has a screen or card for it, and the prompt's claims are true
    const at = makeLoader({}, web)("src/lib/ai/app-tools.ts");
    const five = ["get_arc_balance", "get_other_chain_balances", "send_usdc_arc", "fund_wallet_from_chain", "get_chain_payments"];
    check("chains: the app is given the five Arc and other-chain tools, none of them is still listed as denied, and the website no longer tells the app it lacks them", five.every((t) => at.isAppTool(t) && !(t in at.APP_DENIED_NAMES)) && !/not in the app yet/.test([read(web, "src/lib/ai/tools.ts"), read(web, "src/lib/ai/cryptorefills-tools.ts"), read(web, "src/lib/ai/stocks-tools.ts")].join("\n")));
    const chatSrc = read(app, "src/components/chat/ChatSheet.tsx");
    check("chains: the cards for the tools that need one exist in the app (Arc send, wallet top-up, and the Bitrefill, Cryptorefills, stock and Doma cards with fundFrom)", chatSrc.includes("out?.arcSend === true") && chatSrc.includes("out?.chainTopUp === true") && ["CryptorefillsPaymentCard", "StockTradeCard", "DomaListingCard"].every((c) => read(app, `src/components/chat/${c}.tsx`).includes("fundFrom")) && read(app, "src/components/chat/BitrefillPaymentCard.tsx").includes("arcCheckout"));
    check("chains: the prompt's app wording (Arc tab, Bridge to Arc, Other chain, Pay from another chain, Wallets card with Arc) is on screens that exist", prompt.includes("🟣 Arc") && prompt.includes("Bring USDC to Arc") && prompt.includes("Home's Wallets card shows the EVM, Arc and Solana USDC") && prompt.includes("Pay from another chain") && read(app, "src/components/dashboard/FundWalletSheet.tsx").includes("🟣 Arc") && read(app, "src/components/dashboard/WalletTabs.tsx").includes("Bring USDC to Arc") && read(app, "src/components/dashboard/CryptorefillsProductSheet.tsx").includes("SWAP_CHAINS.map((c)") && read(app, "src/app/(tabs)/index.tsx").includes("useArcUsdcBalance"));
    const crSheet = read(app, "src/components/dashboard/CryptorefillsProductSheet.tsx");
    check("chains: the prompt's claims about the app's checkout are true (a chip per chain on the Cryptorefills page, coins listed up front with each network its own chip, logos on the wallet sheet and History, Bitrefill chips naming their network)", prompt.includes("separate chips under Pay with") && prompt.includes("one chip per chain in the app") && prompt.includes("listed up front, grouped by coin with each of its networks as its own chip") && prompt.includes("ETH · Base, USDC · Arc") && crSheet.includes("coinGroups.map(([coin, ms])") && crSheet.includes("setPay({ chain: c })") && read(app, "src/components/dashboard/PaymentMethodPicker.tsx").includes("methodNetworkName") && read(app, "src/components/dashboard/HistorySection.tsx").includes("netBadge") && read(app, "src/components/dashboard/FundWalletSheet.tsx").includes("<ChainLabel"));
    check("chains: the tools' payment methods are the app's (zcash, hyperliquid, robinhood, arc, tempo) and the History labels the tools' text promises exist", ["zcash", "hyperliquid", "robinhood", "arc", "tempo"].every((m) => toolsIndex.includes(m) && read(app, "src/lib/payment-methods.ts").includes("'" + m + "'")) && ["arc", "zcash", "hyperliquid", "robinhood", "tempo", "doma", "backpack"].every((c) => read(app, "src/components/dashboard/HistorySection.tsx").includes("chain === '" + c + "'")));
    check("chains: Backpack trades don't earn Shar, as the prompt says (the website now writes them to History as investments)", prompt.includes("Backpack stock and ETF trades do not earn Shar") && read(web, "src/lib/shar-rules.ts").includes('excludedChains: ["backpack"]') && read(web, "src/lib/shar.ts").includes("not in (${chains})"));
  }
  {
    // The activity history: the server's entry kinds are the app's, and the agent reads (and the prompt describes) all of them
    const kinds = (src) => [...(/ActivityKind =([^;]*);/.exec(src)?.[1] ?? "").matchAll(/["']([a-z]+)["']/g)].map((m) => m[1]).sort().join();
    const serverKinds = kinds(read(web, "src/lib/activity-rules.ts"));
    check("activity: the entry kinds the server sends are the ones the app can show (a new kind can't reach the app unnamed), including Daily Sparks and weekly prizes", serverKinds === kinds(read(app, "src/lib/activity-format.ts")) && serverKinds.includes("spark") && serverKinds.includes("prize"), serverKinds);
    const feedSrc = read(web, "src/lib/activity-feed.ts");
    const actScreen = read(app, "src/app/activity.tsx");
    check("activity: the feed reads Daily Sparks and weekly prizes, the Activity screen draws them, and both are described to the agent (tool descriptions and prompt)", feedSrc.includes("from shar_sparks") && feedSrc.includes("from shar_weekly_awards") && actScreen.includes("case 'spark'") && actScreen.includes("case 'prize'") && tools.includes("Daily Sparks, weekly trial prizes") && prompt.includes("Daily Sparks, weekly trial prizes"));
    check("get_my_shar: its description tells the agent to call it for the Daily Spark, badges, squads and the weekly board and prizes", ["Daily Spark", "badges", "squad", "weekly trial rank with the prizes"].every((w) => tools.includes(w)));
  }
  check("Daily Spark: the app screen, the Home card and the Profile row the prompt names exist", fs.existsSync(path.join(app, "src/app/spark.tsx")) && read(app, "src/app/(tabs)/index.tsx").includes("<SparkCard />") && read(app, "src/components/profile/ProfileContent.tsx").includes("<Text style={styles.sharTitle}>Daily Spark</Text>") && prompt.includes("bluvfi://spark"));
    check("weekly board: open to everyone on Invite friends and the Spark screen, as the prompt says", read(app, "src/app/invite.tsx").includes("<WeeklyBoard") && read(app, "src/app/spark.tsx").includes("<WeeklyBoard") && prompt.includes("open to everyone"));
  }
  check("voice: the permission message and the settings hand-off the prompt describes exist in the app", read(app, "src/hooks/use-voice-input.ts").includes("Microphone access is off") && read(app, "src/hooks/use-voice-input.ts").includes("openSettings") && prompt.includes("Microphone access is off"));
  check("Premium: the app really has an upgrade path in Profile, as the prompt says", read(app, "src/app/(tabs)/profile.tsx").includes("onUpgrade") && prompt.includes("Bluvfi Premium (Profile, Upgrade)"));
  check("the quota hint the prompt mentions is real", sheet.includes(" left today") && sheet.includes("remainingToday <= 20") && prompt.includes("messages left today"));
  const chatCtx = read(app, "src/lib/chat-context.tsx");
  check("context: the app sends a normalized purchase COUNT as billCount and always 0 for bills due, so the prompt labels it 'Digital products purchased' and never says bills are due", chatCtx.includes("totalBillsDueUsd: 0") && chatCtx.includes("normalizeStatus(p.status) === 'completed'") && /isNativeApp\(ctx\)[\s\S]{0,200}Digital products purchased/.test(prompt));
}
{
  const card = read(app, "src/components/chat/BitrefillPaymentCard.tsx");
  const wd = read(app, "src/components/invest/StockWithdrawSheet.tsx");
  check("Bitrefill card: supported wallet rails plus generic manual deposit rails, and no 'Pay from my wallet' button, as the prompt says", prompt.includes("Paying a Bitrefill purchase in this app") && prompt.includes("accepted token and chain choices") && prompt.includes("I've sent it") && card.includes("tokenForMethod") && card.includes("manualTransferRequired") && card.includes("isManualMethod(pm)") && card.includes("pm.includes('solana') ? <PayFromPicker") && !card.includes("Pay from my wallet"));
  check("stock credit withdrawal: the $1 minimum the prompt gives is the sheet's", prompt.includes("(minimum $1)") && wd.includes("Number(amount) >= 1"));
}
check("the agent knows about the team's question on a listing", prompt.includes("teamQuestion") && prompt.includes("declinedBecause"));

finish();
