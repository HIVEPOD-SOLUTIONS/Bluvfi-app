/**
 * Provider setup on the phone (src/lib/provider-config.ts): the request inputs, the steps to do first, the connection settings, and
 * the Try-it form. These mirror the server's rules; the checks here run before anything is sent. Also checks that the screens use them.
 *
 *     node scripts/tests/provider-config.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const c = makeLoader({})("src/lib/provider-config.ts");
const read = (p) => fs.readFileSync(path.join(__dirname, "../..", p), "utf8");

const draft = (o = {}) => ({ ...c.emptyField(), key: "city", label: "City", ...o });

// ── names from labels
check("suggestKey: a label becomes a property name", c.suggestKey("Number of days") === "number_of_days" && c.suggestKey("  City!! ") === "city" && c.suggestKey("Zürich") === "zurich" && c.suggestKey("") === "");
check("suggestKey: never starts with a digit, never too long", /^[a-z]/.test(c.suggestKey("3 days")) && c.suggestKey("x".repeat(80)).length <= 32);
check("splitChoices: commas and new lines, tidy, no blanks", JSON.stringify(c.splitChoices(" metric ,imperial,, \n scientific ")) === '["metric","imperial","scientific"]');

// ── the inputs
check("no inputs is fine (free-form)", c.fieldsProblem([]) === null);
check("a simple input passes", c.fieldsProblem([draft()]) === null);
check("the name must be a plain identifier and unique", c.fieldsProblem([draft({ key: "1a" })]) !== null && c.fieldsProblem([draft({ key: "a b" })]) !== null && c.fieldsProblem([draft(), draft({ label: "Again" })]) !== null && c.fieldsProblem([draft({ key: "City" }), draft({ key: "city" })]) !== null);
check("a label is needed and limited", c.fieldsProblem([draft({ label: "" })]) !== null && c.fieldsProblem([draft({ label: "x".repeat(41) })]) !== null);
check("a choice needs 2–10 different options", c.fieldsProblem([draft({ type: "choice", choicesText: "a" })]) !== null && c.fieldsProblem([draft({ type: "choice", choicesText: "a, A" })]) !== null && c.fieldsProblem([draft({ type: "choice", choicesText: Array.from({ length: 11 }, (_, i) => "o" + i).join(",") })]) !== null && c.fieldsProblem([draft({ type: "choice", choicesText: "metric, imperial" })]) === null);
check("help and example text are limited", c.fieldsProblem([draft({ help: "x".repeat(121) })]) !== null && c.fieldsProblem([draft({ placeholder: "x".repeat(61) })]) !== null);
check("at most 12 inputs", c.fieldsProblem(Array.from({ length: 13 }, (_, i) => draft({ key: "k" + i }))) !== null && c.fieldsProblem(Array.from({ length: 12 }, (_, i) => draft({ key: "k" + i }))) === null);

const sent = c.fieldsPayload([draft({ label: "  City   name ", help: " Where? ", type: "choice", choicesText: "a, b", required: false })]);
check("payload: tidy text, options as a list, empty optional parts as null", JSON.stringify(sent) === JSON.stringify([{ key: "city", label: "City name", type: "choice", required: false, help: "Where?", placeholder: null, choices: ["a", "b"], default: null }]));
check("payload: a starting value is kept while it fits the type, dropped when it doesn't", c.fieldsPayload([draft({ default: "Lagos" })])[0].default === "Lagos" && c.fieldsPayload([draft({ type: "number", default: "Lagos" })])[0].default === null && c.fieldsPayload([draft({ type: "choice", choicesText: "a,b", default: "a" })])[0].default === "a" && c.fieldsPayload([draft({ type: "choice", choicesText: "a,b", default: "z" })])[0].default === null);
const server = [{ key: "days", label: "Days", type: "number", required: false, help: "How many", placeholder: "3", choices: null, default: 3 }];
const roundTrip = c.fieldsPayload(c.fieldDraftsFrom(server));
check("editing: loading a provider's inputs and sending them back changes nothing (so an untouched section never sends it back to review)", JSON.stringify(roundTrip) === JSON.stringify(server));
check("editing: drafts from nothing are empty", c.fieldDraftsFrom(null).length === 0 && c.fieldDraftsFrom(undefined).length === 0);

// ── requirements, link, notes
check("requirements: blanks are dropped, text tidied", JSON.stringify(c.cleanRequirements(["  Create   an account ", "", "  "])) === '["Create an account"]');
check("requirements: up to five, each 5–140 characters", c.requirementsProblem([]) === null && c.requirementsProblem(["A real step to do"]) === null && c.requirementsProblem(Array.from({ length: 6 }, () => "A real step to do")) !== null && c.requirementsProblem(["no"]) !== null && c.requirementsProblem(["x".repeat(141)]) !== null && c.requirementsProblem(["", "  "]) === null);
check("public links: https only, no IPs, ports or logins (empty is fine)", c.publicUrlProblem("", "link") === null && c.publicUrlProblem("https://acme.example.com/x", "link") === null && ["http://a.example.com", "acme.example.com", "https://10.0.0.1", "https://localhost", "https://u:p@a.example.com", "https://a.example.com:8443", "javascript:1"].every((u) => c.publicUrlProblem(u, "link") !== null));
check("public links: the message names what it is", /setup link/.test(c.publicUrlProblem("http://x.com", "setup link")));
check("team notes: up to 500 characters", c.teamNotesProblem("") === null && c.teamNotesProblem("x".repeat(500)) === null && c.teamNotesProblem("x".repeat(501)) !== null);

// ── connection
const A = (o = {}) => ({ ...c.EMPTY_AUTH, ...o });
check("auth: no key needs nothing", c.authProblem(A()) === null);
check("auth: an API-key header needs a header name and the key", c.authProblem(A({ type: "header", header: "X-API-Key", secret: "k" })) === null && c.authProblem(A({ type: "header", secret: "k" })) !== null && c.authProblem(A({ type: "header", header: "X-API-Key" })) !== null);
check("auth: a bearer token needs only the token", c.authProblem(A({ type: "bearer", secret: "t" })) === null && c.authProblem(A({ type: "bearer" })) !== null);
check("auth: header names Bluvfi owns are refused", ["Host", "content-type", "Accept", "User-Agent", "Cookie", "Content-Length", "X-Bluvfi-Listing", "x-bluvfi-anything"].every((h) => c.authProblem(A({ type: "header", header: h, secret: "k" })) !== null) && c.authProblem(A({ type: "header", header: "bad header", secret: "k" })) !== null);
check("auth: an already-saved key may be left blank, but a typed one is still checked", c.authProblem(A({ type: "header", header: "X-API-Key", hasSecret: true })) === null && c.authProblem(A({ type: "bearer", hasSecret: true, secret: "a\nb" })) !== null && c.authProblem(A({ type: "bearer", secret: "x".repeat(501) })) !== null);
check("auth payload: 'none' sends only the type; a saved key is NOT resent unless typed", JSON.stringify(c.authPayload(A({ type: "none", secret: "ignored" }))) === '{"type":"none"}' && c.authPayload(A({ type: "header", header: " X-Key ", hasSecret: true })).secret === undefined && c.authPayload(A({ type: "header", header: " X-Key ", secret: " k " })).secret === "k" && c.authPayload(A({ type: "header", header: " X-Key ", secret: "k" })).header === "X-Key" && c.authPayload(A({ type: "bearer", secret: "t" })).header === undefined);

// ── copying setup from another provider
const srcAuth = { type: "header", header: "X-API-Key", hasSecret: true };
const source = {
  id: "src-1",
  name: "Weather Wisp",
  inputFields: [{ key: "city", label: "City", type: "text", required: true, help: "Where?", placeholder: "Lagos", choices: null, default: null }],
  requirements: ["Create a free account at Acme"],
  setupUrl: "https://acme.example.com/signup",
  auth: srcAuth,
};
const copied = c.copySetupFrom(source);
check("copy: brings the inputs, steps, setup link and connection", copied.fields.length === 1 && copied.fields[0].key === "city" && copied.fields[0].help === "Where?" && JSON.stringify(copied.requirements) === '["Create a free account at Acme"]' && copied.setupUrl === "https://acme.example.com/signup" && copied.auth.type === "header" && copied.auth.header === "X-API-Key");
check("copy: the key is never on the phone: the connection becomes 'same key as that provider'", copied.auth.secret === "" && copied.auth.copyFrom && copied.auth.copyFrom.id === "src-1" && copied.auth.copyFrom.name === "Weather Wisp" && c.authProblem(copied.auth) === null);
check("copy: it is sent to the server as 'copy the key from', and a typed key wins", c.authPayload(copied.auth).copySecretFrom === "src-1" && c.authPayload(copied.auth).secret === undefined && c.authPayload({ ...copied.auth, secret: " mine " }).copySecretFrom === undefined && c.authPayload({ ...copied.auth, secret: " mine " }).secret === "mine");
check("copy: a source with no key saved copies the settings but no key (so the owner must enter one)", (() => { const k = c.copySetupFrom({ ...source, auth: { type: "bearer", header: "Authorization", hasSecret: false } }); return k.auth.copyFrom === null && k.auth.type === "bearer" && c.authProblem(k.auth) !== null; })());
check("copy: 'no key' copies as no key, and a bearer source drops the header name", (() => { const n = c.copySetupFrom({ ...source, auth: { type: "none", header: null, hasSecret: false } }); const b = c.copySetupFrom({ ...source, auth: { type: "bearer", header: "Authorization", hasSecret: true } }); return n.auth.type === "none" && n.auth.copyFrom === null && b.auth.header === "" && b.auth.copyFrom.id === "src-1"; })());
check("copy: the copy is independent of the original (editing the copy never changes the source)", (() => { const k = c.copySetupFrom(source); k.requirements.push("x"); k.fields[0].label = "Changed"; return source.requirements.length === 1 && source.inputFields[0].label === "City"; })());
check("copy: a copied setup passes the same checks as a typed one", c.fieldsProblem(copied.fields) === null && c.requirementsProblem(copied.requirements) === null && c.publicUrlProblem(copied.setupUrl, "setup link") === null);
check("copy: a provider with nothing set up isn't offered", c.hasSetup({ inputFields: null, requirements: null, setupUrl: null, auth: { type: "none", header: null, hasSecret: false } }) === false && c.hasSetup(source) === true && c.hasSetup({ inputFields: [], requirements: [], setupUrl: null, auth: { type: "none", header: null, hasSecret: false } }) === false);
check("copy: the list shows what copying would bring", c.setupSummary(source) === "1 input · 1 step · setup link · API-key header · key saved" && c.setupSummary({ inputFields: null, requirements: null, setupUrl: null, auth: { type: "none", header: null, hasSecret: false } }) === "no setup" && /2 inputs/.test(c.setupSummary({ ...source, inputFields: [source.inputFields[0], source.inputFields[0]] })));


// ── the owner's own terms
const T = (text = "", url = "") => ({ text, url });
const GOODT = "You may use this for lawful purposes only. Do not resell the data.";
check("terms: none is fine, text alone, a link alone, or both", c.termsProblem(T()) === null && c.termsProblem(T(GOODT)) === null && c.termsProblem(T("", "https://acme.example.com/terms")) === null && c.termsProblem(T(GOODT, "https://acme.example.com/terms")) === null);
check("terms: too short to mean anything is refused, up to 2,000 is fine, more is not", c.termsProblem(T("short")) !== null && /too short/.test(c.termsProblem(T("short"))) && c.termsProblem(T("x".repeat(2000))) === null && c.termsProblem(T("x".repeat(2001))) !== null && c.termsProblem(T("   ")) === null);
check("terms: the link must be a public https address", ["http://a.example.com", "https://10.0.0.1", "javascript:1", "a.example.com"].every((u) => c.termsProblem(T("", u)) !== null) && /link to your terms/.test(c.termsProblem(T("", "http://x.com"))));
check("terms payload: nothing typed means null (which removes them on an edit)", c.termsPayload(T()) === null && c.termsPayload(T("  ", " ")) === null);
check("terms payload: tidy text, only what was typed", JSON.stringify(c.termsPayload(T("  " + GOODT + "\r\nMore. ", ""))) === JSON.stringify({ text: GOODT + "\nMore." }) && JSON.stringify(c.termsPayload(T("", " https://acme.example.com/t "))) === JSON.stringify({ url: "https://acme.example.com/t" }));
check("terms changed: untouched is not a change (so a live provider isn't sent back for nothing)", c.termsChanged(T(GOODT, "https://acme.example.com/terms"), { text: GOODT, url: "https://acme.example.com/terms" }) === false && c.termsChanged(T(), null) === false && c.termsChanged(T(), { text: null, url: null }) === false);
check("terms changed: the server adds a trailing slash to a bare address, which must not count as a change", c.termsChanged(T("", "https://acme.example.com"), { text: null, url: "https://acme.example.com/" }) === false);
check("terms changed: any real change is one: text, link, adding or removing", c.termsChanged(T(GOODT + "!"), { text: GOODT, url: null }) === true && c.termsChanged(T(GOODT, "https://b.example.com/"), { text: GOODT, url: "https://a.example.com/" }) === true && c.termsChanged(T(GOODT), null) === true && c.termsChanged(T(), { text: GOODT, url: null }) === true);
const withTerms = { ...source, terms: { text: GOODT, url: null } };
check("copy: the owner's own terms come along", c.copySetupFrom(withTerms).terms.text === GOODT && c.copySetupFrom(source).terms.text === "" && c.copySetupFrom(source).terms.url === "");
check("copy: a provider with only terms is worth copying from, and the list says so", c.hasSetup({ inputFields: null, requirements: null, setupUrl: null, auth: { type: "none", header: null, hasSecret: false }, terms: { text: GOODT, url: null } }) === true && /your terms/.test(c.setupSummary(withTerms)));

// ── the Try-it form
const fields = [
  { key: "city", label: "City", type: "text", required: true, help: null, placeholder: null, choices: null, default: null },
  { key: "days", label: "Days", type: "number", required: false, help: null, placeholder: null, choices: null, default: 3 },
  { key: "units", label: "Units", type: "choice", required: false, help: null, placeholder: null, choices: ["metric", "imperial"], default: null },
  { key: "alerts", label: "Alerts", type: "boolean", required: false, help: null, placeholder: null, choices: null, default: null },
];
const start = c.callValuesFrom(fields);
check("form starts with each input's own default, blank otherwise, and 'no' for yes/no", JSON.stringify(start) === '{"city":"","days":"3","units":"","alerts":false}' && JSON.stringify(c.callValuesFrom(null)) === "{}");
check("form: a required input must be filled", /“City” is required/.test(c.callProblem(fields, start)) && c.callProblem(fields, { ...start, city: "Lagos" }) === null);
check("form: numbers and choices are checked", /must be a number/.test(c.callProblem(fields, { ...start, city: "a", days: "abc" })) && /one of: metric, imperial/.test(c.callProblem(fields, { ...start, city: "a", units: "parsec" })) && c.callProblem(fields, { ...start, city: "a", days: "2.5", units: "metric" }) === null);
check("form: an optional blank input is fine", c.callProblem(fields, { ...start, city: "a", days: "" }) === null);
check("body: each value in its own type, blank optional inputs left out, yes/no always present", JSON.stringify(c.callBody(fields, { city: " Lagos ", days: "5", units: "", alerts: true })) === '{"city":"Lagos","days":5,"alerts":true}');
check("body: the starting values go through", JSON.stringify(c.callBody(fields, { ...start, city: "a" })) === '{"city":"a","days":3,"alerts":false}');
check("JSON box: the form as JSON", JSON.parse(c.bodyToJson(fields, { ...start, city: "a" })).days === 3);
// the same case the server accepts: its default fills a blank required field
const withDefault = [{ ...fields[0], default: "Lagos" }];
check("form: a required input with a default is valid when left blank (the server fills it in)", c.callProblem(withDefault, { city: "" }) === null);

// ── the screens use all of it
const form = read("src/components/shar/ProviderFormScreen.tsx");
check("the form page asks for the inputs, steps, key and notes, in that order, then the ownership tick", ["Basics", "What people send", "Before it can be used", "Connect your API", "Notes for the Bluvfi team"].every((t) => form.includes(`title="${t}"`)) && form.includes("Before you send") && form.indexOf('title="What people send"') < form.indexOf('title="Before it can be used"') && form.indexOf('title="Notes for the Bluvfi team"') < form.indexOf('Before you send'));
check("the form page sends the setup, key and the ownership tick with a new provider", /rightsConfirmed: true/.test(form) && /auth: authPayload\(auth\)/.test(form) && /fieldsPayload\(fields\)/.test(form));
check("the form page only sends what changed when editing, and never resends a saved key", /changes\.inputFields/.test(form) && /changes\.auth = authPayload\(auth\)/.test(form) && /auth\.secret\.trim\(\) !== ''/.test(form));
check("the form asks for the ownership tick only for a NEW provider, and sends a non-creator to the sign-up (never stuck on an error)", /return editing \? null : rightsProblem\(rights\)/.test(form) && form.includes("creator_required") && form.includes("creator_terms_outdated") && /!editId && !!creatorState\.data/.test(form) && !form.includes("publisherPayload"));
check("the form offers to copy setup from another provider, asks before replacing what's there, and sends the copy-key request when editing too", form.includes("copySetupFrom(src)") && form.includes("Replace this setup?") && form.includes("auth.copyFrom) changes.auth = authPayload(auth)") && form.includes("Copy setup from another provider"));
check("the key box is hidden text", /secureTextEntry/.test(form));
check("the form has an optional section for the owner's own terms, sends them with a new provider, and only sends a CHANGE when editing", form.includes('title="Your terms for people who use it"') && form.includes("customTerms: termsPayload(terms) ?? undefined") && form.includes("if (termsChanged(terms, editing.terms)) changes.customTerms = termsPayload(terms)") && form.includes("termsProblem(terms)"));
const pageSrc = read("src/app/provider/[id].tsx");
check("the provider page shows the owner's terms, asks people (not the owner) to agree, records it on the server, and keeps Run off until they do", pageSrc.includes("useAcceptTerms") && pageSrc.includes("needsTerms = !!p?.terms && !p?.mine && !p?.termsAcceptedAt") && pageSrc.includes("disabled={!live || needsAck || needsTerms || !!bodyProblem}") && pageSrc.includes("hash: p.terms!.hash") && pageSrc.includes("Bluvfi didn’t write these"));
check("the page says the terms are the owner's, not Bluvfi's, and that Bluvfi's terms still apply", pageSrc.includes("Bluvfi’s Terms of Service apply too"));
check("the reviewer sees the owner's terms to check them against Bluvfi's rules", read("src/components/admin/ListingReviewSheet.tsx").includes("OWNER'S OWN TERMS FOR USERS"));
check("Add, Remix and Manage go to the page (no sheet)", /'\/provider\/new'/.test(read("src/app/(tabs)/network.tsx")) && /'\/provider\/edit\/\[id\]'/.test(read("src/app/(tabs)/network.tsx")) && /'\/provider\/new'/.test(read("src/app/provider/[id].tsx")) && !fs.existsSync(path.join(__dirname, "../../src/components/shar/ProviderForm.tsx")));
check("the root stack registers both pages", /name="provider\/new"/.test(read("src/app/_layout.tsx")) && /name="provider\/edit\/\[id\]"/.test(read("src/app/_layout.tsx")));
const page = read("src/app/provider/[id].tsx");
check("the provider page shows the steps, gates Try it on ticking them (not for the owner) and builds a form from the inputs", /Before you use it/.test(page) && /needsAck/.test(page) && /!p\?\.mine && !ack/.test(page) && /callBody\(fields!, values\)/.test(page) && /Edit as JSON instead/.test(page));
const review = read("src/components/admin/ListingReviewSheet.tsx");
check("the reviewer sees the inputs, steps, key status and the owner's notes, and can ask for more info", /REQUEST INPUTS/.test(review) && /NOTES FROM THE OWNER/.test(review) && /HOW WE CONNECT/.test(review) && /request_info/.test(review) && /Ask for more info/.test(review));
check("the owner sees the team's question on their card", /The team asked/.test(read("src/app/(tabs)/network.tsx")));

finish();
