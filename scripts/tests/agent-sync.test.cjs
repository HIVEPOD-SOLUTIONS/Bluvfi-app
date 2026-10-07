/**
 * The AI agent and the app stay in step (needs the web repo next to this one): every tool the agent has for Shar and the open provider
 * network is described in its prompt and has a card in the chat; every bluvfi:// link the agent can produce opens a real screen; and
 * the things the agent says the app can do are things the app really has. If a feature is added on one side and not the other, this fails.
 *
 *     node scripts/tests/agent-sync.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { reporter } = require("./_harness.cjs");
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
const routes = new Set(["/crypto", "/profile", "/", "/shar", "/network", "/faq", "/activity", "/creator"]);
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
  const bitrefill = read(app, "src/components/dashboard/BitrefillCatalogSheet.tsx");
  const home = read(app, "src/app/(tabs)/index.tsx");
  const minFund = /const MIN_FUND_AMOUNT = (\d+)/.exec(fund)?.[1];
  check("Fund Wallet: the tabs, the minimum and the networks the prompt lists are the real ones", ["Buy", "Balances", "Send", "Bridge", "Solana"].every((t) => fund.includes(`label: '`) && fund.includes(t)) && minFund === "11" && prompt.includes(`$${minFund} minimum`) && ["Base", "Ethereum", "Arbitrum", "Optimism", "Polygon", "Avalanche", "Solana"].every((n) => fund.includes(`label: '${n}'`) && prompt.includes(n)));
  check("Invest: the view names, filter chips and provider cards the prompt lists exist", ["My Portfolio", "Market"].every((x) => invest.includes(x)) && ["All", "Stocks", "Pre-IPO", "ETFs", "Crypto Trading"].every((x) => invest.includes(`label: '${x}'`) && prompt.includes(x)) && ["Backpack", "GetEquity", "Nosana GPU Cloud", "Doma Protocol"].every((x) => invest.includes(`name="${x}"`) && prompt.includes(x)));
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
  check("ads: the app only has rewarded ads, the button says what the prompt says, and Premium has no ad button", sheet.includes("Watch Ad — Get More Messages") && prompt.includes('"Watch Ad — Get More Messages"') && sheet.includes("{!isPremium && (") && !/nterstitial/.test(read(app, "src/lib/admob.ts")) && prompt.includes("no interstitial ads after purchases"));
  check("notifications: the app has no push notifications, as the prompt says", !pkg.includes("expo-notifications") && prompt.includes("no push notifications yet"));
  check("voice: the permission message and the settings hand-off the prompt describes exist in the app", read(app, "src/hooks/use-voice-input.ts").includes("Microphone access is off") && read(app, "src/hooks/use-voice-input.ts").includes("openSettings") && prompt.includes("Microphone access is off"));
  check("Premium: the app really has an upgrade path in Profile, as the prompt says", read(app, "src/app/(tabs)/profile.tsx").includes("onUpgrade") && prompt.includes("Bluvfi Premium (Profile, Upgrade)"));
  check("the quota hint the prompt mentions is real", sheet.includes(" left today") && sheet.includes("remainingToday <= 20") && prompt.includes("messages left today"));
  const chatCtx = read(app, "src/lib/chat-context.tsx");
  check("context: the app sends a purchase COUNT as billCount and always 0 for bills due, so the prompt labels it 'Digital products purchased' and never says bills are due", chatCtx.includes("totalBillsDueUsd: 0") && chatCtx.includes("p.status === 'completed'") && /isNativeApp\(ctx\)[\s\S]{0,200}Digital products purchased/.test(prompt));
}
{
  const card = read(app, "src/components/chat/BitrefillPaymentCard.tsx");
  const wd = read(app, "src/components/invest/StockWithdrawSheet.tsx");
  check("Bitrefill card: USDC one tap (Base/Solana with Pay from on Solana), manual XRP and BSC USDT, and no 'Pay from my wallet' button, as the prompt says", prompt.includes("Paying a Bitrefill purchase in this app") && card.includes("pm === 'usdt_bsc'") && card.includes("pm === 'xrp'") && card.includes("pm.includes('solana') ? <PayFromPicker") && !card.includes("Pay from my wallet"));
  check("stock credit withdrawal: the $1 minimum the prompt gives is the sheet's", prompt.includes("(minimum $1)") && wd.includes("Number(amount) >= 1"));
}
check("the agent knows about the team's question on a listing", prompt.includes("teamQuestion") && prompt.includes("declinedBecause"));

finish();
