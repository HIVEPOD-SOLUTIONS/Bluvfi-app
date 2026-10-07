/**
 * The terms someone agrees to when adding a provider to the open network. The server records which VERSION was accepted (and when),
 * and refuses a submission made against an old one, so when you change anything below bump the version here AND in the web repo's
 * src/lib/provider-publisher-rules.ts (a test checks they match).
 *
 * This is a plain-language summary of how the network works, not a substitute for the full Terms. Have the wording reviewed before launch.
 */
export const PROVIDER_TERMS_VERSION = '2026-10-07';

/** The full Terms of Service, linked from the agreement. */
export const PROVIDER_TERMS_URL = 'https://waitlist.bluvfi.xyz/terms';

export const PROVIDER_TERMS: { title: string; body: string }[] = [
  {
    title: 'It’s yours to offer',
    body: 'You own this service, or you’re allowed to offer it through Bluvfi. What you say about it is true.',
  },
  {
    title: 'Keep people safe',
    body: 'It must not break the law or try to harm, trick or track the people and AI agents who use it. No malware, phishing, scams or illegal content.',
  },
  {
    title: 'Treat requests as private',
    body: 'What people send you is only for answering their request. Don’t keep it, share it or sell it beyond that.',
  },
  {
    title: 'The team can step in',
    body: 'The Bluvfi team checks every listing and can decline, pause or remove it at any time, for example if it’s unsafe, down or misleading. Big changes to it are checked again.',
  },
  {
    title: 'Payouts',
    body: 'For paid calls you keep 80% and withdraw it as SKR once you have $5. The team reviews payouts and can hold or decline one if something looks wrong. You’re responsible for any taxes on what you earn.',
  },
];
