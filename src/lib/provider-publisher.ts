import { PROVIDER_TERMS_VERSION } from '@/constants/provider-terms';

/**
 * Becoming a provider CREATOR is an opt-in sign-up: who is behind it, how to reach them, and agreement to the provider terms. These
 * checks mirror the server's (src/lib/provider-publisher-rules.ts in the web repo), so a problem is caught on the phone instead of after
 * sending. The server checks again and has the last word. Adding a provider then only needs a per-listing "I own this service" tick.
 */

export type OperatorType = 'individual' | 'company';

export const COMPANY_MIN = 2;
export const COMPANY_MAX = 80;
export const EMAIL_MAX = 120;

export interface CreatorFields {
  /** null until the person picks one: it has to be an answer, not a default. */
  operator: OperatorType | null;
  companyName: string;
  companyWebsite: string;
  email: string;
  termsAccepted: boolean;
}

export const EMPTY_CREATOR: CreatorFields = { operator: null, companyName: '', companyWebsite: '', email: '', termsAccepted: false };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const tidy = (v: string) => v.trim().replace(/\s+/g, ' ');

export const emailProblem = (email: string): string | null => {
  const e = tidy(email).toLowerCase();
  return e.length <= EMAIL_MAX && EMAIL.test(e) ? null : 'Enter an email address the team can reach you on.';
};

/** A public https:// web address, as the server accepts for a website (no IP addresses, ports or logins). Empty is fine. */
export function websiteProblem(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return 'The website must be a public https:// address.';
  }
  const host = u.hostname.toLowerCase();
  const ok = u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && host.includes('.') && !host.includes(':') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  return ok ? null : 'The website must be a public https:// address.';
}

/** Who is behind it and how to reach them (what can change after signing up): the first thing wrong, or null. */
export function contactProblem(f: Pick<CreatorFields, 'operator' | 'companyName' | 'companyWebsite' | 'email'>): string | null {
  if (!f.operator) return 'Tell us whether you’re listing as an individual or as a company or team.';
  if (f.operator === 'company') {
    const name = tidy(f.companyName);
    if (name.length < COMPANY_MIN || name.length > COMPANY_MAX) return `Enter your company or team name (${COMPANY_MIN}–${COMPANY_MAX} characters).`;
    const site = websiteProblem(f.companyWebsite);
    if (site) return site;
  }
  return emailProblem(f.email);
}

/** The first thing wrong with a sign-up, in the order the screen asks, or null when it's complete. */
export function creatorProblem(f: CreatorFields): string | null {
  const c = contactProblem(f);
  if (c) return c;
  if (!f.termsAccepted) return 'Agree to the provider terms to become a creator.';
  return null;
}

/** The sign-up sent to the server. Company details are left out for an individual. */
export function creatorPayload(f: CreatorFields) {
  const company = f.operator === 'company';
  return {
    operatorType: f.operator as OperatorType,
    companyName: company ? tidy(f.companyName) : undefined,
    companyWebsite: company && f.companyWebsite.trim() ? f.companyWebsite.trim() : undefined,
    contactEmail: tidy(f.email).toLowerCase(),
    termsAccepted: f.termsAccepted,
    termsVersion: PROVIDER_TERMS_VERSION,
  };
}

/** What a profile edit sends: only what changed (an individual drops the company details, so they travel with the switch). Empty = nothing. */
export function creatorChanges(
  f: CreatorFields,
  current: { operatorType: string; companyName: string | null; companyWebsite: string | null; contactEmail: string },
) {
  const changes: { operatorType?: OperatorType; companyName?: string | null; companyWebsite?: string | null; contactEmail?: string } = {};
  const op: OperatorType = f.operator === 'company' ? 'company' : 'individual';
  if (op !== (current.operatorType === 'company' ? 'company' : 'individual')) changes.operatorType = op;
  if (op === 'company') {
    if (tidy(f.companyName) !== (current.companyName ?? '')) changes.companyName = tidy(f.companyName);
    if (f.companyWebsite.trim() !== (current.companyWebsite ?? '')) changes.companyWebsite = f.companyWebsite.trim() || null;
    if (changes.operatorType === 'company') {
      changes.companyName = tidy(f.companyName);
      changes.companyWebsite = f.companyWebsite.trim() || null;
    }
  }
  if (tidy(f.email).toLowerCase() !== current.contactEmail) changes.contactEmail = tidy(f.email).toLowerCase();
  return changes;
}

/** Every provider needs its own tick that the person owns the service or may offer it. */
export const rightsProblem = (confirmed: boolean): string | null => (confirmed ? null : 'Confirm that you own this service or are allowed to offer it.');
