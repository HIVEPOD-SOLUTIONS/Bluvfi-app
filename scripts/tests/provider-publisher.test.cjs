/**
 * Becoming a provider CREATOR (an opt-in sign-up) and the per-provider ownership tick: what the phone checks before sending
 * (src/lib/provider-publisher.ts), what it sends, how the screens use it, and that the terms version matches the server's. The server
 * checks everything again and has the last word.
 *
 *     node scripts/tests/provider-publisher.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();

const terms = makeLoader({})("src/constants/provider-terms.ts");
const pub = makeLoader({})("src/lib/provider-publisher.ts");
const read = (rel) => fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");

const full = (o = {}) => ({ operator: "individual", companyName: "", companyWebsite: "", email: "ada@example.com", termsAccepted: true, ...o });
const company = (o = {}) => full({ operator: "company", companyName: "Acme Labs", ...o });

// ── what is checked, in the order the screen asks
check("a complete individual passes", pub.creatorProblem(full()) === null);
check("a complete company passes (website optional)", pub.creatorProblem(company()) === null && pub.creatorProblem(company({ companyWebsite: "https://acme.example.com" })) === null);
check("nothing answered: asks who's behind it first", /individual or as a company/.test(pub.creatorProblem(pub.EMPTY_CREATOR)));
check("company: a name is required (2–80 characters)", [company({ companyName: "" }), company({ companyName: "A" }), company({ companyName: "x".repeat(81) })].every((f) => /company or team name/.test(pub.creatorProblem(f))));
check("company: the name is not needed for an individual", pub.creatorProblem(full({ companyName: "" })) === null);
check("website: only a public https address (or nothing)", pub.websiteProblem("") === null && pub.websiteProblem("   ") === null && pub.websiteProblem("https://acme.example.com/about") === null && ["http://acme.example.com", "acme.example.com", "https://10.0.0.1", "https://x.example.com:8443"].every((w) => pub.websiteProblem(w) !== null));
check("website: a bad one on a company blocks the sign-up", pub.creatorProblem(company({ companyWebsite: "http://nope.example.com" })) !== null);
check("email: must look like an address", ["", "ada", "ada@", "@example.com", "ada@example", "ada @example.com"].every((e) => pub.emailProblem(e) !== null) && pub.emailProblem("Ada@Example.COM") === null && pub.emailProblem("  ada@example.com ") === null);
check("email: too long is refused", pub.emailProblem("a".repeat(120) + "@example.com") !== null);
check("the provider terms must be agreed to (after the contact details)", /terms/.test(pub.creatorProblem(full({ termsAccepted: false }))) && /individual or as a company/.test(pub.creatorProblem(full({ operator: null, termsAccepted: false }))));
check("the contact check alone (used when only editing the profile) ignores the terms", pub.contactProblem(full({ termsAccepted: false })) === null && pub.contactProblem(full({ email: "nope" })) !== null);
check("each provider needs its own ownership tick", /own this service/.test(pub.rightsProblem(false)) && pub.rightsProblem(true) === null);

// ── what is sent
const p1 = pub.creatorPayload(company({ companyName: "  Acme   Labs ", companyWebsite: " https://acme.example.com ", email: " Ada@Example.com " }));
check("payload (company): tidy name, website, lowercased email, the agreement and the terms version", p1.operatorType === "company" && p1.companyName === "Acme Labs" && p1.companyWebsite === "https://acme.example.com" && p1.contactEmail === "ada@example.com" && p1.termsAccepted === true && p1.termsVersion === terms.PROVIDER_TERMS_VERSION);
const p2 = pub.creatorPayload(full({ companyName: "Left over", companyWebsite: "https://left.example.com" }));
check("payload (individual): company details typed earlier are NOT sent", p2.operatorType === "individual" && p2.companyName === undefined && p2.companyWebsite === undefined);
check("payload: no website typed means none sent; no ownership tick travels with a sign-up", pub.creatorPayload(company()).companyWebsite === undefined && !("rightsConfirmed" in p1));

// ── editing the profile sends only what changed
const cur = { operatorType: "individual", companyName: null, companyWebsite: null, contactEmail: "ada@example.com" };
const ch = (f, c = cur) => pub.creatorChanges(f, c);
check("edit: nothing changed sends nothing (email compared tidy and lowercased)", Object.keys(ch(full({ email: " ADA@example.com " }))).length === 0);
check("edit: a new email is the only thing sent", JSON.stringify(ch(full({ email: "new@example.com" }))) === JSON.stringify({ contactEmail: "new@example.com" }));
check("edit: switching to a company sends the operator with the company details", JSON.stringify(ch(company({ companyWebsite: "https://acme.example.com" }))) === JSON.stringify({ operatorType: "company", companyName: "Acme Labs", companyWebsite: "https://acme.example.com" }));
const asCompany = { operatorType: "company", companyName: "Acme Labs", companyWebsite: "https://acme.example.com/", contactEmail: "ada@example.com" };
check("edit: switching to an individual sends just the operator (the server drops the company details)", JSON.stringify(ch(full(), asCompany)) === JSON.stringify({ operatorType: "individual" }));
check("edit: changing only the company name sends only that", JSON.stringify(ch(company({ companyName: "Acme Group", companyWebsite: "https://acme.example.com/" }), asCompany)) === JSON.stringify({ companyName: "Acme Group" }));
check("edit: clearing the website sends null", JSON.stringify(ch(company({ companyWebsite: "" }), asCompany)) === JSON.stringify({ companyWebsite: null }));

// ── the terms
check("terms: five plain items, each with a title and a real sentence", terms.PROVIDER_TERMS.length === 5 && terms.PROVIDER_TERMS.every((t) => t.title.length > 3 && t.body.length > 40));
check("terms: they say what the app actually does (80%, $5, SKR, team can remove)", /80%/.test(JSON.stringify(terms.PROVIDER_TERMS)) && /\$5/.test(JSON.stringify(terms.PROVIDER_TERMS)) && /SKR/.test(JSON.stringify(terms.PROVIDER_TERMS)) && /remove it/.test(JSON.stringify(terms.PROVIDER_TERMS)));
check("terms: links to the full Terms of Service over https", /^https:\/\//.test(terms.PROVIDER_TERMS_URL));

// ── same version as the server (needs the sibling web repo)
const web = path.join(__dirname, "../../../bluvfi/src/lib/provider-publisher-rules.ts");
if (fs.existsSync(web)) {
  const m = /PROVIDER_TERMS_VERSION = "([^"]+)"/.exec(fs.readFileSync(web, "utf8"));
  check("the terms version matches the server's (bump both together)", !!m && m[1] === terms.PROVIDER_TERMS_VERSION, `app ${terms.PROVIDER_TERMS_VERSION} vs web ${m && m[1]}`);
} else {
  console.log("SKIP version check: the web repo isn't next to this one");
}

// ── the screens use it
const screen = read("src/app/creator.tsx");
check("the sign-up screen is a real route, registered in the stack, and linkable from chat", fs.existsSync(path.join(__dirname, "../../src/app/creator.tsx")) && read("src/app/_layout.tsx").includes('name="creator"') && read("src/components/chat/MessageBubble.tsx").includes("'bluvfi://creator': '/creator'"));
check("the screen has three modes: sign up, agree again after the terms change, and edit the profile (no terms needed to edit)", screen.includes("'signup' | 'agree' | 'edit'") && screen.includes("mode === 'edit' ? contactProblem(f)") && screen.includes("mode !== 'edit' ?"));
check("sign-up sends the payload; editing sends only the changes", screen.includes("become.mutateAsync(creatorPayload(f))") && screen.includes("update.mutateAsync(changes)") && screen.includes("creatorChanges(f, creator)"));
check("after signing up from 'Add a provider' it carries on to the form (and a remix)", screen.includes("next === 'provider'") && screen.includes("pathname: '/provider/new'") && screen.includes("remix"));
check("it says plainly that being a creator is optional", /It’s optional/.test(screen));
const hooks = read("src/hooks/use-shar.ts");
check("hooks: read, sign up and edit the creator profile on /api/creator", hooks.includes("'/api/creator'") && hooks.includes("export function useCreator") && hooks.includes("export function useBecomeCreator") && hooks.includes("export function useUpdateCreator") && /method: 'PATCH', body: changes/.test(hooks));
check("the API client carries the server's reason code so the form can react to it", read("src/lib/api.ts").includes("code = data.code") && read("src/lib/api.ts").includes("new ApiError(res.status, message, code)"));
const network = read("src/app/(tabs)/network.tsx");
check("the Network screen offers 'Become a creator' (not Add a provider) until they've signed up, and links to the profile after", network.includes("needsSignup") && network.includes("'Become a creator'") && network.includes("Creator profile") && network.includes("pathname: '/creator'"));
const form = read("src/components/shar/ProviderFormScreen.tsx");
check("the form no longer asks who you are: it shows the creator profile and a per-provider ownership tick", !form.includes("EMPTY_PUBLISHER") && form.includes("Listing as") && form.includes("I own this service") && form.includes("rightsConfirmed: true"));
const review = read("src/components/admin/ListingReviewSheet.tsx");
check("the reviewer sees who is behind it, the contact email and the terms (or that there's nothing for older listings)", /CONTACT EMAIL/.test(review) && /LISTED AS/.test(review) && /TERMS/.test(review) && /Not provided/.test(review));

finish();
