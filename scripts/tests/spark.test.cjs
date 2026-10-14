/**
 * Daily Spark in the app: when Shar is celebrated (a gain, a rank-up, never twice), when the reminders go out, the countdown wording,
 * and that every piece is wired in (the screen, the Home card, the weekly board for everyone, the badges, the notification plugin).
 *
 *     node scripts/tests/spark.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const root = path.join(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// ── celebrations
const cel = makeLoader({})("src/lib/shar-celebrate.ts");
const seen = (o = {}) => ({ lifetime: 100, tier: "wisp", referralBonus: 0, providerEarned: 0, ...o });
const snap = (o = {}) => ({ ...seen(), tierName: "Wisp", ...o });
check("the first ever look at an account celebrates nothing", cel.celebrationFor(null, snap({ lifetime: 500 })) === null);
check("no gain, no celebration", cel.celebrationFor(seen(), snap()) === null);
const gain = cel.celebrationFor(seen(), snap({ lifetime: 125 }));
check("a purchase gain: +25 Shar, from your purchase", gain && gain.kind === "gain" && gain.shar === 25 && gain.source === "purchase" && gain.title === "+25 Shar" && /purchase/.test(gain.subtitle), JSON.stringify(gain));
const comp = cel.celebrationFor(seen(), snap({ lifetime: 105, referralBonus: 5 }));
check("a companion's spending is named as the source", comp && comp.source === "companion" && comp.shar === 5);
const prov = cel.celebrationFor(seen(), snap({ lifetime: 101, providerEarned: 1 }));
check("a provider being used is named as the source", prov && prov.source === "provider");
const rank = cel.celebrationFor(seen({ lifetime: 490, tier: "wisp" }), snap({ lifetime: 520, tier: "guide", tierName: "Guide" }));
check("crossing a rank is a rank-up that names the new rank and the Shar that got there", rank && rank.kind === "rank" && rank.tier === "guide" && rank.title === "You are now a Guide" && rank.shar === 30 && /30 Shar/.test(rank.subtitle), JSON.stringify(rank));
check("a rank-up wins over a plain gain, even when the gain was celebrated elsewhere", cel.celebrationFor(seen({ lifetime: 490 }), snap({ lifetime: 520, tier: "guide", tierName: "Guide" }), 30)?.kind === "rank");
check("Shar from a Daily Spark that its own screen celebrated is not celebrated again", cel.celebrationFor(seen(), snap({ lifetime: 103 }), 3) === null);
check("only the part not already celebrated is announced (a spark plus a purchase)", cel.celebrationFor(seen(), snap({ lifetime: 128 }), 3)?.shar === 25);
check("going down (it never should) or staying put is never a celebration", cel.celebrationFor(seen({ lifetime: 200 }), snap({ lifetime: 150 })) === null);
check("a rank that is lower than before is not a rank-up", cel.celebrationFor(seen({ tier: "guide" }), snap({ tier: "wisp", lifetime: 100 })) === null);
cel.ignoreNextGain(3);
check("a reload that brought no new Shar leaves the ignore waiting for the one that does", cel.consumeIgnoredGain(0) === 0 && cel.consumeIgnoredGain(3) === 3 && cel.consumeIgnoredGain(5) === 0);
cel.ignoreNextGain(10);
check("the ignore never takes more than what was gained", cel.consumeIgnoredGain(4) === 4 && cel.consumeIgnoredGain(100) === 6);
let got = [];
const off = cel.onCelebrate((c) => got.push(c));
cel.celebrate({ kind: "gain", shar: 1, source: "purchase", title: "+1 Shar", subtitle: "" });
off();
cel.celebrate({ kind: "gain", shar: 2, source: "purchase", title: "+2 Shar", subtitle: "" });
check("listeners hear a celebration until they unsubscribe", got.length === 1 && got[0].shar === 1);
const s = cel.snapshotOf({ lifetime: 7, tier: { tier: "guide", name: "Guide" }, referral: { bonus: 2 }, provider: { earned: 1 } });
check("a loaded summary is reduced to the few numbers that matter", s.lifetime === 7 && s.tier === "guide" && s.referralBonus === 2 && s.providerEarned === 1 && s.tierName === "Guide");

// ── reminders (Android's notification module stubbed out: the schedule is pure)
const rem = makeLoader({ "react-native": { Platform: { OS: "ios" } }, "expo-secure-store": { getItemAsync: async () => null, setItemAsync: async () => {} } })("src/lib/reminders.ts");
const at = (iso) => new Date(iso);
check("the streak reminder goes out 3 hours before the reset (21:00 UTC) when today's spark is not collected", rem.streakReminderAt(at("2026-10-13T09:00:00Z"), false).toISOString() === "2026-10-13T21:00:00.000Z");
check("if today's is already collected, the reminder waits for tomorrow's window", rem.streakReminderAt(at("2026-10-13T09:00:00Z"), true).toISOString() === "2026-10-14T21:00:00.000Z");
check("if the window has already started, the reminder moves to tomorrow instead of firing late or in the past", rem.streakReminderAt(at("2026-10-13T22:30:00Z"), false).toISOString() === "2026-10-14T21:00:00.000Z");
check("a reminder is never in the past, whatever the hour", [0, 5, 12, 20, 21, 22, 23].every((h) => [true, false].every((c) => rem.streakReminderAt(at(`2026-10-13T${String(h).padStart(2, "0")}:30:00Z`), c).getTime() > Date.parse(`2026-10-13T${String(h).padStart(2, "0")}:30:00Z`))));
check("the next trial reset is the coming Monday 00:00 UTC", rem.nextTrialReset(at("2026-10-13T12:00:00Z")).toISOString() === "2026-10-19T00:00:00.000Z" && rem.nextTrialReset(at("2026-10-19T00:00:00Z")).toISOString() === "2026-10-26T00:00:00.000Z");
check("the trial reminder is 6 hours before it (Sunday 18:00 UTC), and moves a week on if that has passed", rem.trialReminderAt(at("2026-10-13T12:00:00Z")).toISOString() === "2026-10-18T18:00:00.000Z" && rem.trialReminderAt(at("2026-10-18T20:00:00Z")).toISOString() === "2026-10-25T18:00:00.000Z");
check("the wording says the streak, or invites a new one", /7-day streak/.test(rem.streakReminderCopy(7, at("2026-10-13T21:00:00Z")).title) && /waiting/.test(rem.streakReminderCopy(0, at("2026-10-13T21:00:00Z")).title));
check("without the native module the reminders are unavailable rather than crashing", rem.remindersAvailable === false && rem.syncReminders({ collectedToday: false, streak: 1 }) instanceof Promise);
const remSrc = read("src/lib/reminders.ts");
check("the notification module is loaded defensively, like expo-audio, so an older build still starts", remSrc.includes("try {") && remSrc.includes("require('expo-notifications')") && remSrc.includes("N = null"));
check("each reminder has a fixed id, so there is only ever one of each pending", remSrc.includes("identifier: STREAK_ID") && remSrc.includes("identifier: TRIAL_ID") && remSrc.includes("cancelScheduledNotificationAsync(STREAK_ID)"));
check("reminders are off until the person turns them on (permission is only asked then)", remSrc.includes("let enabled = false") && remSrc.includes("requestPermissionsAsync") && !read("src/hooks/use-spark-reminders.ts").includes("requestPermissionsAsync"));

// ── countdown
const { timeLeft } = makeLoader({})("src/lib/time-left.ts");
const T = Date.parse("2026-10-13T12:00:00Z");
check("time left reads as days and hours, hours and minutes, or minutes, and 'soon' once passed", timeLeft("2026-10-16T16:30:00Z", T) === "3d 4h" && timeLeft("2026-10-13T17:12:00Z", T) === "5h 12m" && timeLeft("2026-10-13T12:09:00Z", T) === "9m" && timeLeft("2026-10-13T11:00:00Z", T) === "soon");

// ── wiring
const spark = read("src/app/spark.tsx");
check("the Spark screen is open to everyone (not behind CreatorOnly) and uses the server's collect", !spark.includes("CreatorOnly") && spark.includes("useCollectSpark") && spark.includes("collect.mutateAsync()"));
check("the Spark screen shows the streak, the 7 days, what is next, the weekly board, the badges and the rules from the server", spark.includes("spark.streak") && spark.includes("<Days days={spark.days}") && spark.includes("spark.next.shar") && spark.includes("<WeeklyBoard") && spark.includes("<BadgeRow") && spark.includes("spark.rules"));
check("tapping the orb collects, and the orb bursts with a sound", spark.includes("onPress={onCollect}") && spark.includes("<SharBurst trigger={shot}") && spark.includes("playSharChime("));
check("a failed or repeated collect says why instead of failing silently", spark.includes("Couldn’t collect it") && spark.includes("(e as Error)?.message"));
check("the Seeker boost line is shown, and says it is checked on the server", spark.includes("Seeker Genesis") && spark.includes("checked on our server"));
const layout = read("src/app/_layout.tsx");
check("the route is registered for signed-in users and the celebration host is mounted over every screen", layout.includes('<Stack.Screen name="spark" />') && layout.includes("<CelebrationHost />") && layout.includes("isAuthenticated ? <CelebrationHost />"));
check("the assistant can link to the screen (bluvfi://spark)", read("src/components/chat/MessageBubble.tsx").includes("'bluvfi://spark': '/spark'"));
check("Home shows the Spark card to everyone, outside the creator-only Shar card", /<SparkCard \/>[\s\S]*\{shar && isCreator \?/.test(read("src/app/(tabs)/index.tsx")));
const invite = read("src/app/invite.tsx");
check("Invite friends shows the weekly board and the Spark card, for everyone", invite.includes("<WeeklyBoard") && invite.includes("<SparkCard />"));
const sharScreen = read("src/app/(tabs)/shar.tsx");
check("the Shar screen shows the Spark card, the weekly board and the badges", sharScreen.includes("<SparkCard />") && sharScreen.includes("<WeeklyBoard />") && sharScreen.includes("<BadgeRow"));
const board = read("src/components/shar/WeeklyBoard.tsx");
check("the weekly board says when it resets, marks Seeker holders and shows prizes only when the server sends them", board.includes("Resets in {timeLeft(board.weekEndsAt)}") && board.includes("row.seeker") && board.includes("prizes.length > 0"));
const host = read("src/components/shar/CelebrationHost.tsx");
check("the host remembers what was last seen per account, so Shar that landed while the app was closed is celebrated and a first look is not", host.includes("SecureStore.getItemAsync(keyFor(userId))") && host.includes("celebrationFor(prev, next, ignore)") && host.includes("consumeIgnoredGain"));
check("a Spark collected on its own screen is marked as already celebrated", read("src/hooks/use-shar.ts").includes("ignoreNextGain(res.spark.shar)"));
check("the burst respects the phone's reduce-motion setting", read("src/components/shar/SharBurst.tsx").includes("useReducedMotion"));
const hooks = read("src/hooks/use-spark-reminders.ts");
check("a tap on a notification opens the screen it names, but only from an allowed list", hooks.includes("listenForReminderTaps((url) =>") && hooks.includes("NOTIFICATION_SCREENS[url]") && remSrc.includes("addNotificationResponseReceivedListener") && ["spark", "shar", "network", "activity"].every((n) => hooks.includes("'bluvfi://" + n + "'")) && !hooks.includes("router.push(url"));
const appJson = JSON.parse(read("app.json"));
check("expo-notifications is a plugin, and the AdMob app id key at the top level is still there", appJson.expo.plugins.some((p) => Array.isArray(p) && p[0] === "expo-notifications") && appJson["react-native-google-mobile-ads"] && appJson["react-native-google-mobile-ads"].android_app_id.startsWith("ca-app-pub-"));
check("the package is installed at the SDK 57 version", /"expo-notifications": "~57\./.test(read("package.json")));

check("an older server (no spark or badges yet) never crashes the screens: the card and the badges simply do not show", read("src/components/shar/BadgeRow.tsx").includes("if (!badges || badges.length === 0) return null") && read("src/components/shar/SparkCard.tsx").includes("if (!spark) return null"));

(async () => {
// ── the home-screen widget
const store = new Map();
const secure = { getItemAsync: async (k) => store.get(k) ?? null, setItemAsync: async (k, v) => void store.set(k, v), deleteItemAsync: async (k) => void store.delete(k) };
const wd = makeLoader({ "expo-secure-store": secure })("src/widgets/spark-widget-data.ts");
const snap = (o) => ({ day: "2026-10-13", streak: 5, collectedToday: true, seeker: false, ...o });
const at13 = new Date("2026-10-13T20:00:00Z");
check("widget: nothing saved yet invites the person to open the app", wd.viewFor(null).empty && /Open Bluvfi/.test(wd.viewFor(null).status));
const v0 = wd.viewFor(snap({}), at13);
check("widget: collected today shows the streak and 'Collected today'", v0.collected && v0.streak === 5 && v0.headline === "5 day streak" && v0.status === "Collected today");
const v1 = wd.viewFor(snap({}), new Date("2026-10-14T00:30:00Z"));
check("widget: the next day, with no network, it flips to 'keep your streak' with the streak still alive", !v1.collected && v1.streak === 5 && /keep your streak/.test(v1.status));
const v2 = wd.viewFor(snap({}), new Date("2026-10-15T09:00:00Z"));
check("widget: after a missed day the streak reads 0 and it invites a new one", v2.streak === 0 && !v2.collected && v2.status === "Tap to collect");
check("widget: a spark not yet collected today keeps the streak from yesterday, and loses it a day later", wd.viewFor(snap({ collectedToday: false, streak: 3 }), at13).streak === 3 && wd.viewFor(snap({ collectedToday: false, streak: 3 }), new Date("2026-10-14T10:00:00Z")).streak === 0);
check("widget: a one-day streak reads in the singular, and no streak says so", wd.viewFor(snap({ streak: 1 }), at13).headline === "1 day streak" && wd.viewFor(snap({ streak: 0, collectedToday: false }), at13).streak === 0);
await wd.saveSnapshot(snap({ seeker: true }));
const back = await wd.loadSnapshot();
check("widget: the snapshot is saved and read back", back && back.streak === 5 && back.seeker === true && back.collectedToday === true);
store.set("bluvfi.spark-widget", "{not json");
check("widget: a damaged snapshot reads as nothing saved, not a crash", (await wd.loadSnapshot()) === null);
store.set("bluvfi.spark-widget", JSON.stringify({ day: 5 }));
check("widget: a snapshot of the wrong shape is ignored", (await wd.loadSnapshot()) === null);
await wd.saveSnapshot(snap({}));
await wd.clearSnapshot();
check("widget: signing out clears it", (await wd.loadSnapshot()) === null);

// the phone's copy of the day rules is the server's
const web = path.join(__dirname, "../../../bluvfi");
if (fs.existsSync(path.join(web, "src/lib/shar-spark-rules.ts"))) {
  const srv = makeLoader({}, web)("src/lib/shar-spark-rules.ts");
  const phone = makeLoader({})("src/lib/spark-streak.ts");
  const days = ["2026-01-01", "2026-03-01", "2028-03-01", "2026-12-31", "2026-10-13"];
  const lasts = [null, ...days.flatMap((d) => [{ day: d, streak: 4 }])];
  check("the phone's day rules match the server's exactly (days, previous day, live streak) across month, leap-year and year ends", days.every((d) => srv.dayBefore(d) === phone.dayBefore(d)) && days.every((d) => lasts.every((l) => JSON.stringify(srv.liveStreak(l, d)) === JSON.stringify(phone.liveStreak(l, d)))) && srv.sparkDay(new Date("2026-10-13T23:59:59Z")) === phone.sparkDay(new Date("2026-10-13T23:59:59Z")));
}
const widgetSrc = read("src/widgets/SparkWidget.tsx");
check("widget: tapping it opens the Spark screen through the app's own bluvfi:// scheme", widgetSrc.includes("clickAction=\"OPEN_URI\"") && widgetSrc.includes("uri: 'bluvfi://spark'") && appJson.expo.scheme === "bluvfi");
const widgetCfg = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === "react-native-android-widget");
check("widget: it is declared in the build (name SparkWidget, refreshed about every 30 minutes), and the name matches the code that draws it", widgetCfg && widgetCfg[1].widgets[0].name === "SparkWidget" && widgetCfg[1].widgets[0].updatePeriodMillis >= 1800000 && read("src/widgets/widget-task-handler.tsx").includes("'SparkWidget'") && read("src/widgets/sync-spark-widget.tsx").includes("widgetName: 'SparkWidget'"));
const entry = read("index.js");
check("widget: the app's entry registers the widget handler on Android before Expo Router starts, tolerating a build without the library", JSON.parse(read("package.json")).main === "index.js" && entry.indexOf("registerWidgetTaskHandler(widgetTaskHandler)") > -1 && entry.indexOf("registerWidgetTaskHandler(widgetTaskHandler)") < entry.indexOf("require('expo-router/entry')") && entry.includes("Platform.OS === 'android'") && entry.includes("catch (error)"));
check("widget: the app keeps it in step (saves the streak when it changes) and wipes it on sign-out", hooks.includes("syncSparkWidget({ day: sparkDay(), streak, collectedToday, seeker: seeker === true })") && hooks.includes("resetSparkWidget()"));
check("widget: the library is loaded defensively, so an older build without it still starts", read("src/widgets/sync-spark-widget.tsx").includes("catch {") && read("src/widgets/sync-spark-widget.tsx").includes("lib = null"));

// ── push alerts
// ── alerts: no push service, the phone asks the server's inbox
const inboxSrc = read("src/lib/inbox-poll.ts");
const taskSrc = read("src/lib/inbox-task.ts");
check("alerts: turning on reminders also asks the server for this phone's alert key, stores it, starts the background check, and tells the person which they got", hooks.includes("/api/notifications/key") && hooks.includes("saveInbox(made.key, made.cursor)") && hooks.includes("startInboxTask()") && hooks.includes("alerts: reminders ? await enableAlerts() : false") && spark.includes("res.alerts") && spark.includes("Reminders and alerts are on"));
check("alerts: turning them off stops the check, forgets the key and has the server revoke it", hooks.includes("stopInboxTask()") && hooks.includes("clearInbox()") && hooks.includes("method: 'DELETE'") && hooks.includes("body: { key }"));
check("alerts: the app checks on launch and each time it comes to the front, and restores the background schedule once per launch", hooks.includes("pollInbox();") && hooks.includes("AppState.addEventListener('change'") && hooks.includes("restored.current"));
check("alerts: there is no Firebase, Google, Expo push or device-token code anywhere in the app's alert path", !/firebase|fcm|getDevicePushTokenAsync|getExpoPushTokenAsync|googleServicesFile|google-services/i.test([inboxSrc, taskSrc, hooks, remSrc].join(String.fromCharCode(10)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")) && !fs.existsSync(path.join(root, "google-services.json")) && !/googleServicesFile/.test(read("app.json")));
check("alerts: the background check is defined at the top level of a module the entry file loads first (before any screen), defensively", taskSrc.includes("TaskManager.defineTask(INBOX_TASK") && taskSrc.includes("registerTaskAsync(INBOX_TASK, { minimumInterval: INBOX_INTERVAL_MIN })") && /require\('\.\/src\/lib\/inbox-task'\)/.test(read("index.js")) && read("index.js").indexOf("inbox-task") < read("index.js").indexOf("require('expo-router/entry')") && taskSrc.includes("INBOX_INTERVAL_MIN = 15"));
check("alerts: the background packages are installed at the SDK 57 version", /"expo-background-task": "~57\./.test(read("package.json")) && /"expo-task-manager": "~57\./.test(read("package.json")) && JSON.stringify(appJson.expo.plugins).includes('"expo-background-task"'));
check("alerts: the wording is honest that alerts are not instant", spark.includes("not instant") && spark.includes("when your phone next checks"));

// the poll itself, with a fake server, a fake store and a fake notification
const mem = new Map();
const deps = (replies, shown) => ({
  fetchFn: async (url, init) => {
    deps.last = { url, init };
    const r = replies.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  },
  show: async (item) => {
    shown.push(item.title);
    return item.title !== "cannot-show";
  },
  storage: { get: async (k) => mem.get(k) ?? null, set: async (k, v) => void mem.set(k, v), remove: async (k) => void mem.delete(k) },
});
const poll = makeLoader({ "expo-secure-store": secure, "@/lib/api": { API_BASE_URL: "https://api.test" }, "@/lib/reminders": { showNow: async () => true } })("src/lib/inbox-poll.ts");
const item = (id, title) => ({ id, title, body: title + " body", url: "bluvfi://spark", at: "2026-10-14T10:00:00.000Z" });
{
  const shown = [];
  const none = await poll.pollInbox(deps([], shown));
  check("poll: with alerts off (no key) nothing is asked and nothing shown", none.status === "off" && none.shown === 0 && shown.length === 0 && !deps.last);
  await poll.saveInbox("bvi_key", 7, deps([], shown));
  const r1 = await poll.pollInbox(deps([{ status: 200, body: { items: [item(8, "one"), item(9, "two")], cursor: 9 } }], shown));
  check("poll: it asks from the saved cursor with the key as a bearer, shows each alert once, and moves the cursor", r1.status === "ok" && r1.shown === 2 && shown.join() === "one,two" && deps.last.url === "https://api.test/api/notifications/inbox?after=7" && deps.last.init.headers.Authorization === "Bearer bvi_key" && mem.get("bluvfi.inbox-cursor") === "9");
  const r2 = await poll.pollInbox(deps([{ status: 200, body: { items: [], cursor: 9 } }], shown));
  check("poll: asking again with nothing new shows nothing, and asks from the new cursor", r2.shown === 0 && deps.last.url.endsWith("after=9") && shown.length === 2);
  const r3 = await poll.pollInbox(deps([new Error("offline")], shown));
  check("poll: being offline is a quiet 'error', the cursor stays, and nothing throws", r3.status === "error" && mem.get("bluvfi.inbox-cursor") === "9");
  const r4 = await poll.pollInbox(deps([{ status: 500, body: {} }], shown));
  check("poll: a server error leaves everything as it was", r4.status === "error" && mem.get("bluvfi.inbox-key") === "bvi_key");
  const r5 = await poll.pollInbox(deps([{ status: 200, body: { items: [item(10, "cannot-show"), item(11, "ok-after")], cursor: 11 } }], shown));
  check("poll: an alert that can't be shown (notifications blocked) is skipped, not retried forever, and the ones after it still show", r5.shown === 1 && shown.includes("ok-after") && mem.get("bluvfi.inbox-cursor") === "11");
  const r6 = await poll.pollInbox(deps([{ status: 200, body: { items: [{ id: 12, title: 5 }, item(13, "fine")], cursor: 13 } }], shown));
  check("poll: a malformed alert from the server is ignored without breaking the rest", r6.shown === 1 && shown.includes("fine"));
  const r7 = await poll.pollInbox(deps([{ status: 401, body: {} }], shown));
  check("poll: when the server says the key is no longer valid the phone forgets it and stops asking", r7.status === "revoked" && !mem.has("bluvfi.inbox-key") && !mem.has("bluvfi.inbox-cursor") && (await poll.pollInbox(deps([], shown))).status === "off");
  await poll.saveInbox("bvi_key2", 3.9, deps([], shown));
  check("poll: the saved cursor is a whole, non-negative number", mem.get("bluvfi.inbox-cursor") === "3");
  await poll.clearInbox(deps([], shown));
  check("poll: turning alerts off clears the key and the cursor", mem.size === 0 || (!mem.has("bluvfi.inbox-key") && !mem.has("bluvfi.inbox-cursor")));
}
const allowed = [...hooks.slice(hooks.indexOf("NOTIFICATION_SCREENS"), hooks.indexOf("};", hooks.indexOf("NOTIFICATION_SCREENS"))).matchAll(/'(bluvfi:\/\/[a-z]+)'/g)].map((m) => m[1]).sort();
check("push: a notification can only open one of four known screens", allowed.join() === "bluvfi://activity,bluvfi://network,bluvfi://shar,bluvfi://spark", allowed.join());

// ── squads and prizes in the app
const squadCard = read("src/components/shar/SquadCard.tsx");
check("squads: the Spark screen has the Squad card, open to everyone", spark.includes("<SquadCard />") && !squadCard.includes("CreatorOnly"));
check("squads: start with a name, join with a code, leave with a confirmation, and share the code", squadCard.includes("action: 'create'") && squadCard.includes("action: 'join'") && squadCard.includes("action: 'leave'") && squadCard.includes("Alert.alert('Leave this squad?'") && squadCard.includes("squadInviteMessage(squad.name, squad.code)"));
check("squads: it shows the pool against the goal, each member, and the board of squads by their generated names", squadCard.includes("squad.goal") && squadCard.includes("squad.members.map") && squadCard.includes("SQUADS THIS WEEK") && squadCard.includes("s.name"));
check("squads: an older server (no squad tables) reads 'being switched on', never an error screen", squadCard.includes("!data.ready"));
const sq = makeLoader({})("src/lib/squad.ts");
check("squads: the code box keeps only the characters a code can have, upper-cased, and no more than six", sq.normalizeSquadCode("ab c-d2 e0o1ilf9z", 6) === "ABCD2E" && sq.normalizeSquadCode("") === "" && sq.squadInviteMessage("Lagos", "ABC234").includes("ABC234"));
check("prizes: the board shows the prize list in Shar, who is on course for one, and the minimum to qualify", board.includes("win Shar this week") && board.includes("board?.prizeMinShar") && board.includes("row.prizeShar") && read("src/hooks/use-shar.ts").includes("prizeShar: number | null"));
check("prizes: they appear in the journey log as their own kind", read("src/hooks/use-shar.ts").includes("'prize'"));

finish();
})();
