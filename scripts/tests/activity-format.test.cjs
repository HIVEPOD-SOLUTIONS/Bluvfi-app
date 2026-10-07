/**
 * How the Activity list is shown (src/lib/activity-format.ts): day headings, grouping, signed amounts and their colours, states.
 * Dates are built from local-time parts so the suite passes in any time zone.
 *
 *     node scripts/tests/activity-format.test.cjs
 */
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const f = makeLoader({})("src/lib/activity-format.ts");

const local = (y, mo, d, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();
const NOW = new Date(2026, 9, 6, 15, 0); // Tue 6 Oct 2026, local

// ── days
check("dayTitle: today and yesterday, whatever the hour", f.dayTitle(local(2026, 10, 6, 0, 5), NOW) === "Today" && f.dayTitle(local(2026, 10, 6, 23, 59), NOW) === "Today" && f.dayTitle(local(2026, 10, 5, 23, 59), NOW) === "Yesterday" && f.dayTitle(local(2026, 10, 5, 0, 1), NOW) === "Yesterday");
check("dayTitle: earlier this year has the weekday, day and month", f.dayTitle(local(2026, 10, 1), NOW) === "Thu 1 Oct" && f.dayTitle(local(2026, 1, 5), NOW) === "Mon 5 Jan");
check("dayTitle: another year shows the year instead", f.dayTitle(local(2025, 12, 31), NOW) === "31 Dec 2025");
check("dayTitle: across a year boundary 'yesterday' is still yesterday", f.dayTitle(local(2025, 12, 31, 20), new Date(2026, 0, 1, 9)) === "Yesterday");

const item = (over) => ({ id: "x", source: "shar", kind: "purchase", title: "T", subtitle: null, amount: 25, unit: "shar", state: "done", at: local(2026, 10, 6, 9), ...over });
const sections = f.groupByDay(
  [item({ id: "a", at: local(2026, 10, 6, 14) }), item({ id: "b", at: local(2026, 10, 6, 9) }), item({ id: "c", at: local(2026, 10, 5, 22) }), item({ id: "d", at: local(2026, 10, 1, 8) })],
  NOW,
);
check("groupByDay: one heading per day, order kept", sections.map((s) => s.title).join("|") === "Today|Yesterday|Thu 1 Oct" && sections[0].data.map((i) => i.id).join() === "a,b");
check("groupByDay: nothing gives nothing", f.groupByDay([], NOW).length === 0);
check("groupByDay: the same day coming back after another day starts a new group (the list is newest first, so this never merges)", f.groupByDay([item({ at: local(2026, 10, 6) }), item({ at: local(2026, 10, 5) }), item({ at: local(2026, 10, 6) })], NOW).length === 3);

// ── amounts
const amt = (over) => f.formatAmount(item(over));
check("amount: earned Shar is a green plus", JSON.stringify(amt({ amount: 25 })) === '{"text":"+25 Shar","tone":"positive"}');
check("amount: thousands are separated and a debit uses a true minus sign", amt({ amount: -1500 }).text === "−1,500 Shar" && amt({ amount: -1500 }).tone === "negative");
check("amount: dollars come from micro-USDC", amt({ unit: "usd", amount: 5_000_000 }).text === "+$5.00" && amt({ unit: "usd", amount: -50_000 }).text === "−$0.05" && amt({ unit: "usd", amount: 1 }).text === "+$0.000001");
check("amount: money still waiting is amber, whatever its sign", ["pending", "review", "sending"].every((state) => amt({ state }).tone === "pending" && amt({ state, amount: -1000 }).tone === "pending"));
check("amount: a declined claim is muted, not red or green", amt({ state: "rejected", amount: -1500 }).tone === "muted" && amt({ state: "rejected", amount: -1500 }).text === "−1,500 Shar");
check("amount: zero is a dash", JSON.stringify(amt({ amount: 0 })) === '{"text":"—","tone":"muted"}' && amt({ amount: 0, state: "rejected" }).text === "—");

// ── states and subtitle
check("stateLabel: settled shows nothing, the rest are plain words", f.stateLabel("done") === null && f.stateLabel("pending") === "Pending" && f.stateLabel("review") === "In review" && f.stateLabel("sending") === "On its way" && f.stateLabel("rejected") === "Declined");
const sub = f.rowSubtitle(item({ at: local(2026, 10, 6, 21, 30), state: "pending" }));
check("rowSubtitle: time of day then state", sub === "9:30 pm · Pending");
check("rowSubtitle: morning times, settled rows have no state, and a detail line sits between", f.rowSubtitle(item({ at: local(2026, 10, 6, 9, 5) })) === "9:05 am" && f.rowSubtitle(item({ at: local(2026, 10, 6, 9, 5), subtitle: "Weather API", state: "rejected" })) === "9:05 am · Weather API · Declined");

// ── sources
check("sources: the four filters, All first", f.ACTIVITY_SOURCES.map((s) => s.key).join() === "all,shar,credits,commission");
check("isActivitySource: only real sources", f.isActivitySource("credits") && f.isActivitySource("all") && !f.isActivitySource("everything") && !f.isActivitySource(undefined) && !f.isActivitySource(["shar"]));

finish();
