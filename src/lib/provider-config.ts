/**
 * How a provider is set up beyond its listing, on the phone: the inputs a caller fills in, the steps a person must do first, how
 * Bluvfi authenticates to the owner's API, and private notes for the team. These checks mirror the server's
 * (src/lib/provider-config-rules.ts in the web repo), so a problem is caught here instead of after sending. The server checks
 * again and has the last word.
 *
 * Public (anyone who opens the provider sees it): the inputs, requirements and setup link. Private: the key and the team notes.
 */

export const LIMITS = {
  maxFields: 12,
  keyMax: 32,
  labelMax: 40,
  helpMax: 120,
  placeholderMax: 60,
  maxChoices: 10,
  choiceMax: 30,
  textValueMax: 500,
  maxRequirements: 5,
  requirementMin: 5,
  requirementMax: 140,
  teamNotesMax: 500,
  headerMax: 40,
  secretMax: 500,
  termsTextMin: 20,
  termsTextMax: 2000,
} as const;

export type FieldType = 'text' | 'number' | 'boolean' | 'choice';
export const FIELD_TYPES: { key: FieldType; label: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'number', label: 'Number' },
  { key: 'boolean', label: 'Yes / no' },
  { key: 'choice', label: 'Choice' },
];

/** An input as the server stores and returns it. */
export interface InputField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  help: string | null;
  placeholder: string | null;
  choices: string[] | null;
  default: string | number | boolean | null;
}

/** An input as it is edited: the options are one comma-separated line, and every box is a string. */
export interface FieldDraft {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  help: string;
  placeholder: string;
  choicesText: string;
  /** Not edited in the form, but kept as it was so editing a provider never drops a starting value. */
  default: string | number | boolean | null;
  /** The name was typed by hand, so it stops following the label. */
  keyTouched: boolean;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const tidy = (v: string) => v.trim().replace(/\s+/g, ' ');

export const emptyField = (): FieldDraft => ({ key: '', label: '', type: 'text', required: true, help: '', placeholder: '', choicesText: '', default: null, keyTouched: false });

/** A property name suggested from a label: "Number of days" -> "number_of_days". */
export function suggestKey(label: string): string {
  const base = label.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, LIMITS.keyMax);
  return /^[a-z]/.test(base) ? base : base ? `f_${base}`.slice(0, LIMITS.keyMax) : '';
}

export const splitChoices = (text: string): string[] => text.split(/[,\n]/).map(tidy).filter(Boolean);

export function fieldDraftsFrom(fields: InputField[] | null | undefined): FieldDraft[] {
  return (fields ?? []).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    help: f.help ?? '',
    placeholder: f.placeholder ?? '',
    choicesText: (f.choices ?? []).join(', '),
    default: f.default,
    keyTouched: true,
  }));
}

/** The first thing wrong with the inputs, or null. */
export function fieldsProblem(drafts: FieldDraft[]): string | null {
  if (drafts.length > LIMITS.maxFields) return `Add up to ${LIMITS.maxFields} request inputs.`;
  const seen = new Set<string>();
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const at = `Input ${i + 1}`;
    const key = d.key.trim();
    if (!KEY.test(key)) return `${at}: the name must start with a letter and use only letters, numbers and underscores.`;
    if (seen.has(key.toLowerCase())) return `${at}: “${key}” is used twice. Each input needs its own name.`;
    seen.add(key.toLowerCase());
    const label = tidy(d.label);
    if (label.length < 1 || label.length > LIMITS.labelMax || CONTROL.test(label)) return `${at}: give it a label (up to ${LIMITS.labelMax} characters).`;
    if (tidy(d.help).length > LIMITS.helpMax) return `${at}: the help text is too long (up to ${LIMITS.helpMax} characters).`;
    if (tidy(d.placeholder).length > LIMITS.placeholderMax) return `${at}: the example text is too long (up to ${LIMITS.placeholderMax} characters).`;
    if (d.type === 'choice') {
      const list = splitChoices(d.choicesText);
      if (list.length < 2 || list.length > LIMITS.maxChoices) return `${at}: a choice needs 2–${LIMITS.maxChoices} options, separated by commas.`;
      if (list.some((c) => c.length > LIMITS.choiceMax)) return `${at}: each option can be up to ${LIMITS.choiceMax} characters.`;
      if (new Set(list.map((c) => c.toLowerCase())).size !== list.length) return `${at}: the options must all be different.`;
    }
  }
  return null;
}

/** The inputs as sent to the server (an empty list means free-form JSON). */
export function fieldsPayload(drafts: FieldDraft[]): InputField[] {
  return drafts.map((d) => {
    const choices = d.type === 'choice' ? splitChoices(d.choicesText) : null;
    // A starting value only survives while it still fits the type (the type may have been changed).
    let def = d.default;
    if (def !== null) {
      const ok = (d.type === 'text' && typeof def === 'string') || (d.type === 'number' && typeof def === 'number') || (d.type === 'boolean' && typeof def === 'boolean') || (d.type === 'choice' && typeof def === 'string' && !!choices?.includes(def));
      if (!ok) def = null;
    }
    return { key: d.key.trim(), label: tidy(d.label), type: d.type, required: d.required, help: tidy(d.help) || null, placeholder: tidy(d.placeholder) || null, choices, default: def };
  });
}

// ── requirements, setup link, notes ───────────────────────────────────────────

export const cleanRequirements = (list: string[]): string[] => list.map(tidy).filter(Boolean);

export function requirementsProblem(list: string[]): string | null {
  const r = cleanRequirements(list);
  if (r.length > LIMITS.maxRequirements) return `List up to ${LIMITS.maxRequirements} requirements.`;
  if (r.some((x) => x.length < LIMITS.requirementMin || x.length > LIMITS.requirementMax)) return `Each requirement should be ${LIMITS.requirementMin}–${LIMITS.requirementMax} characters.`;
  return null;
}

/** A public https:// address as the server accepts one (no IP addresses, ports or logins). Empty is fine. */
export function publicUrlProblem(raw: string, what: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const bad = `The ${what} must be a public https:// address.`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return bad;
  }
  const host = u.hostname.toLowerCase();
  const ok = u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && host.includes('.') && !host.includes(':') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  return ok ? null : bad;
}

export const teamNotesProblem = (text: string): string | null => (text.trim().length > LIMITS.teamNotesMax ? `Keep the notes for the team under ${LIMITS.teamNotesMax} characters.` : null);

// ── the owner's own terms ─────────────────────────────────────────────────────

/** What is typed on the form: text and/or a link to full terms. Both may be empty (no terms of your own). */
export interface TermsDraft {
  text: string;
  url: string;
}

export const EMPTY_TERMS: TermsDraft = { text: '', url: '' };

export function termsProblem(t: TermsDraft): string | null {
  const text = t.text.replace(/\r\n/g, '\n').trim();
  if (text.length > LIMITS.termsTextMax) return `Keep your terms under ${LIMITS.termsTextMax} characters, or put the full terms behind a link.`;
  if (text.length > 0 && text.length < LIMITS.termsTextMin) return `Your terms are too short to mean anything (at least ${LIMITS.termsTextMin} characters), or just add a link.`;
  return publicUrlProblem(t.url, 'link to your terms');
}

/** The terms as sent: null when there are none (which, on an edit, removes them). */
export function termsPayload(t: TermsDraft): { text?: string; url?: string } | null {
  const text = t.text.replace(/\r\n/g, '\n').trim();
  const url = t.url.trim();
  if (!text && !url) return null;
  return { ...(text ? { text } : {}), ...(url ? { url } : {}) };
}

const sameUrl = (a: string, b: string) => {
  const norm = (v: string) => {
    try {
      return new URL(v.trim()).toString();
    } catch {
      return v.trim();
    }
  };
  return (a.trim() === '' && b.trim() === '') || norm(a) === norm(b);
};

/** Whether the terms on the form differ from the saved ones, as the server will see it (so an untouched section never sends a live provider back to review). */
export function termsChanged(draft: TermsDraft, saved: { text: string | null; url: string | null } | null | undefined): boolean {
  const a = termsPayload(draft);
  const b = saved ? termsPayload({ text: saved.text ?? '', url: saved.url ?? '' }) : null;
  if (!a && !b) return false;
  if (!a || !b) return true;
  return (a.text ?? '') !== (b.text ?? '') || !sameUrl(a.url ?? '', b.url ?? '');
}

// ── credentials ───────────────────────────────────────────────────────────────

export type AuthType = 'none' | 'header' | 'bearer';
export const AUTH_TYPES: { key: AuthType; label: string }[] = [
  { key: 'none', label: 'No key' },
  { key: 'header', label: 'API-key header' },
  { key: 'bearer', label: 'Bearer token' },
];

export interface AuthDraft {
  type: AuthType;
  header: string;
  /** What was typed. Empty when unchanged. */
  secret: string;
  /** A key is already saved on the server (an edit). It is never sent back to the phone. */
  hasSecret: boolean;
  /** "Use the same key as this other provider of mine": the server copies it, the phone never sees it. */
  copyFrom: { id: string; name: string } | null;
}

export const EMPTY_AUTH: AuthDraft = { type: 'none', header: '', secret: '', hasSecret: false, copyFrom: null };

const RESERVED_HEADERS = new Set([
  'host', 'content-length', 'content-type', 'accept', 'user-agent', 'connection', 'transfer-encoding', 'te', 'upgrade', 'expect',
  'proxy-authorization', 'proxy-authenticate', 'cookie', 'set-cookie', 'trailer', 'keep-alive', 'via', 'forwarded',
]);
const HEADER_TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export function authProblem(a: AuthDraft): string | null {
  if (a.type === 'none') return null;
  if (a.type === 'header') {
    const name = a.header.trim();
    if (!name || name.length > LIMITS.headerMax || !HEADER_TOKEN.test(name)) return 'Enter the header name your API expects, like X-API-Key.';
    const lower = name.toLowerCase();
    if (RESERVED_HEADERS.has(lower) || lower.startsWith('x-bluvfi-')) return `“${name}” is used by Bluvfi itself. Pick another header name.`;
  }
  const secret = a.secret.trim();
  if (!secret && !a.hasSecret && !a.copyFrom) return 'Enter the key Bluvfi should send to your API.';
  if (secret && (secret.length > LIMITS.secretMax || CONTROL.test(secret))) return `The key must be 1–${LIMITS.secretMax} characters with no line breaks.`;
  return null;
}

/** The connection settings as sent. The key is left out unless one was typed, so a saved key is kept. */
export function authPayload(a: AuthDraft): { type: AuthType; header?: string; secret?: string; copySecretFrom?: string } {
  if (a.type === 'none') return { type: 'none' };
  const typed = a.secret.trim();
  return {
    type: a.type,
    header: a.type === 'header' ? a.header.trim() : undefined,
    secret: typed || undefined,
    // A key typed here wins over copying one.
    copySecretFrom: !typed && a.copyFrom ? a.copyFrom.id : undefined,
  };
}

// ── copying setup from another of the owner's providers ────────────────────────

/** What is needed of one of the owner's providers to copy its setup. */
export interface SetupSource {
  id: string;
  name: string;
  inputFields: InputField[] | null;
  requirements: string[] | null;
  setupUrl: string | null;
  auth: { type: AuthType; header: string | null; hasSecret: boolean };
  /** The owner's own terms for users, if any. */
  terms?: { text: string | null; url: string | null } | null;
}

/** Whether a provider has any setup worth copying. */
export const hasSetup = (p: Pick<SetupSource, 'inputFields' | 'requirements' | 'setupUrl' | 'auth' | 'terms'>): boolean =>
  !!(p.inputFields?.length || p.requirements?.length || p.setupUrl || p.auth.type !== 'none' || p.terms);

/** "3 inputs · 2 steps · setup link · key saved": what copying it would bring. */
export function setupSummary(p: Pick<SetupSource, 'inputFields' | 'requirements' | 'setupUrl' | 'auth' | 'terms'>): string {
  const n = p.inputFields?.length ?? 0;
  const r = p.requirements?.length ?? 0;
  const parts = [
    n ? `${n} input${n === 1 ? '' : 's'}` : null,
    r ? `${r} step${r === 1 ? '' : 's'}` : null,
    p.setupUrl ? 'setup link' : null,
    p.terms ? 'your terms' : null,
    p.auth.type === 'none' ? null : p.auth.type === 'bearer' ? 'bearer token' : 'API-key header',
    p.auth.hasSecret ? 'key saved' : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'no setup';
}

/**
 * The form values for a copy of another provider's setup: its inputs, steps, setup link and connection. The private notes for the
 * team and the contact details are NOT copied. Its key isn't either (the phone never has it): the connection is set to "same key as
 * that provider" and the server copies the key itself.
 */
export function copySetupFrom(src: SetupSource): { fields: FieldDraft[]; requirements: string[]; setupUrl: string; auth: AuthDraft; terms: TermsDraft } {
  return {
    fields: fieldDraftsFrom(src.inputFields),
    requirements: [...(src.requirements ?? [])],
    setupUrl: src.setupUrl ?? '',
    terms: { text: src.terms?.text ?? '', url: src.terms?.url ?? '' },
    auth: {
      type: src.auth.type,
      header: src.auth.type === 'header' ? (src.auth.header ?? '') : '',
      secret: '',
      hasSecret: false,
      copyFrom: src.auth.type !== 'none' && src.auth.hasSecret ? { id: src.id, name: src.name } : null,
    },
  };
}

// ── the Try-it form ───────────────────────────────────────────────────────────

export type CallValues = Record<string, string | boolean>;

/** Starting values for the form: each input's own default, else blank (and "no" for yes/no). */
export function callValuesFrom(fields: InputField[] | null | undefined): CallValues {
  const out: CallValues = {};
  for (const f of fields ?? []) {
    if (f.type === 'boolean') out[f.key] = typeof f.default === 'boolean' ? f.default : false;
    else out[f.key] = f.default === null || f.default === undefined ? '' : String(f.default);
  }
  return out;
}

/** What is wrong with the filled-in form, or null. Mirrors the server's check, so nothing is sent (or charged) that would be refused. */
export function callProblem(fields: InputField[], values: CallValues): string | null {
  for (const f of fields) {
    const v = values[f.key];
    const blank = v === undefined || v === '' || (typeof v === 'string' && v.trim() === '');
    if (f.type === 'boolean') continue;
    if (blank) {
      if (f.required && f.default === null) return `“${f.label}” is required.`;
      continue;
    }
    const s = String(v);
    if (f.type === 'number' && !Number.isFinite(Number(s))) return `“${f.label}” must be a number.`;
    if (f.type === 'text' && s.length > LIMITS.textValueMax) return `“${f.label}” is too long (up to ${LIMITS.textValueMax} characters).`;
    if (f.type === 'choice' && !f.choices?.includes(s)) return `“${f.label}” must be one of: ${f.choices?.join(', ')}.`;
  }
  return null;
}

/** The JSON body for the filled-in form: each value in its own type, blank optional inputs left out. */
export function callBody(fields: InputField[], values: CallValues): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (f.type === 'boolean') {
      body[f.key] = v === true;
      continue;
    }
    const s = typeof v === 'string' ? v.trim() : '';
    if (s === '') continue;
    body[f.key] = f.type === 'number' ? Number(s) : s;
  }
  return body;
}

/** JSON text for the "edit as JSON" box, starting from the form. */
export const bodyToJson = (fields: InputField[], values: CallValues): string => JSON.stringify(callBody(fields, values), null, 2);
