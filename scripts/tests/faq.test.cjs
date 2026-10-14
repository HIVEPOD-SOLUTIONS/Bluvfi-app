/**
 * The FAQ (src/lib/faq.ts): every answer is complete, every number in it comes from the live rules, every link goes somewhere real.
 *
 *     node scripts/tests/faq.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const faq = makeLoader({})("src/lib/faq.ts");

const sections = faq.buildFaq();
const items = faq.allItems(sections);
const text = (s) => JSON.stringify(s);

check("four sections in a sensible order", sections.map((s) => s.key).join() === "start,shar,network,safety");
check("every question has an id, a question and an answer", items.every((i) => i.id && i.q.endsWith("?") && i.a.length > 40));
check("ids are unique and URL-safe (they are used in ?open=)", new Set(items.map((i) => i.id)).size === items.length && items.every((i) => /^[a-z0-9-]+$/.test(i.id)));
const prose = items.flatMap((i) => [i.q, i.a, ...(i.links ?? []).map((l) => l.label)]).concat(sections.flatMap((x) => [x.title, x.intro ?? ""])).join("\n");
check("no unfilled placeholders, 'undefined' or 'NaN' anywhere in the words people read", !/[{}]|undefined|NaN/.test(prose));
check("no invented contact details (there is no support email)", !/@[a-z0-9-]+\.[a-z]/i.test(text(sections)));

// numbers come from the facts
const facts = { perUsd: 2, minPurchaseUsd: 25, referralBonusPct: 15, providerUseShar: 3, skrPerShar: 0.5, minClaimShar: 2500, ownerPct: 70, minWithdrawMicro: 20_000_000, minTopupMicro: 2_500_000, maxClaimAccountsPerPhone: 2 };
const custom = text(faq.buildFaq(facts));
check("custom rules reach the answers (earning, bonus, claim, ownerPct, withdraw, top-up, phone limit)", ["$25", "2 Shar per $1", "15%", "3 Shar", "0.5 SKR", "2,500", "70%", "$20.00", "$2.50", "up to 2 accounts"].every((x) => custom.includes(x)));
check("…and the defaults' numbers are gone from them", !/\$10 or more|1,000 Shar|0\.9 SKR|80%|\$5\.00|up to 3 accounts/.test(custom));
const def = text(sections);
check("defaults say what the server says (1 Shar per $1 from $10, 10% referral, 1,000 Shar = 0.9 SKR each, 80% owner, $5 minimum, $1 top-up)", ["$10 or more", "1 Shar per $1", "10%", "1,000 Shar", "0.9 SKR", "80%", "$5.00", "$1.00", "up to 3 accounts"].every((x) => def.includes(x)));

// links
const ROUTES = new Set(["/shar", "/network", "/activity", "/profile", "/creator", "/spark"]);
const links = items.flatMap((i) => i.links ?? []);
check("every in-app link goes to a screen that exists", links.filter((l) => l.to).every((l) => ROUTES.has(l.to)) && links.filter((l) => l.to).every((l) => fs.existsSync(path.join(__dirname, "../../src/app", l.to === "/profile" ? "(tabs)/profile.tsx" : fs.existsSync(path.join(__dirname, "../../src/app", l.to.slice(1) + ".tsx")) ? l.to.slice(1) + ".tsx" : `(tabs)/${l.to.slice(1)}.tsx`))));
check("every assistant link carries a question to ask", links.filter((l) => l.ask).every((l) => l.ask.length > 8));
check("every link has a label", links.every((l) => l.label.length > 3));

// the screens the other code opens exist
check("the targets other screens use exist (?open=activity-what, ?section=shar|network)", faq.itemById(sections, "activity-what")?.section === "start" && faq.sectionByKey(sections, "shar")?.key === "shar" && faq.sectionByKey(sections, "network")?.key === "network");
check("unknown ids and sections resolve to nothing (never crash)", faq.itemById(sections, "nope") === null && faq.itemById(sections, undefined) === null && faq.sectionByKey(sections, "nope") === null && faq.sectionByKey(sections, ["shar"]) === null);

// facts from live data
check("factsFrom: nothing loaded gives the defaults", text(faq.factsFrom({})) === text(faq.DEFAULT_FACTS));
const live = faq.factsFrom({ rules: { perUsd: 2, minClaimShar: 5000, skrPerShar: 0.8 }, earnings: { ownerPct: 75, minWithdrawMicro: 10_000_000 }, credits: { minTopupMicro: 3_000_000 } });
check("factsFrom: loaded values win, the rest stay default", live.perUsd === 2 && live.minClaimShar === 5000 && live.skrPerShar === 0.8 && live.ownerPct === 75 && live.minWithdrawMicro === 10_000_000 && live.minTopupMicro === 3_000_000 && live.minPurchaseUsd === 10 && live.referralBonusPct === 10);
check("factsFrom: junk (zero, NaN, strings, null) is ignored, never shown", text(faq.factsFrom({ rules: { perUsd: 0, minClaimShar: NaN, skrPerShar: "x" }, earnings: null, credits: { minTopupMicro: -5 } })) === text(faq.DEFAULT_FACTS));

// the in-app help entry points are wired
const read = (p) => fs.readFileSync(path.join(__dirname, "../..", p), "utf8");
check("the root stack registers both screens", /name="faq"/.test(read("src/app/_layout.tsx")) && /name="activity"/.test(read("src/app/_layout.tsx")));
check("the assistant's links open them (bluvfi://faq, bluvfi://activity)", /'bluvfi:\/\/faq': '\/faq'/.test(read("src/components/chat/MessageBubble.tsx")) && /'bluvfi:\/\/activity': '\/activity'/.test(read("src/components/chat/MessageBubble.tsx")));
check("Profile, Shar, the Shar sheet and Network all lead to them", /\/faq/.test(read("src/components/profile/ProfileContent.tsx")) && /\/activity/.test(read("src/components/profile/ProfileContent.tsx")) && /See all/.test(read("src/app/(tabs)/shar.tsx")) && /section: 'shar'/.test(read("src/components/shar/HowSharWorks.tsx")) && /section: 'network'/.test(read("src/app/(tabs)/network.tsx")));

finish();
