import * as SecureStore from 'expo-secure-store';
import { ApiError } from '@/lib/api';

/**
 * Referral codes. A person can enter a friend's code (or open a friend's link) BEFORE they have an account, so the code is kept
 * on the phone and applied the moment they are signed in. It is cleared once the server has decided about it.
 */

const KEY = 'bluvfi_pending_referral';
// Same alphabet and length as the server's referral codes (no 0/O/1/I/L, so a code can be read aloud).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 8;
const SITE = 'https://www.bluvfi.xyz';

/**
 * A clean referral code from whatever the person typed or pasted: the code itself, or a link like
 * https://www.bluvfi.xyz/r/ABCD2345 or bluvfi://ref/ABCD2345. Null when it can't be a code.
 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  const fromLink = /\/(?:r|ref)\/([A-Za-z0-9]+)/.exec(text)?.[1];
  const code = (fromLink ?? text).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return code.length === LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

export const referralLink = (code: string) => `${SITE}/r/${code}`;

/** What a friend is sent: the link, and the code in case the link doesn't open the app. */
export const referralMessage = (code: string) =>
  `Join me on Bluvfi and light your own way. Use my code ${code} when you sign up: ${referralLink(code)}`;

export async function getPendingReferral(): Promise<string | null> {
  try {
    return normalizeReferralCode(await SecureStore.getItemAsync(KEY));
  } catch {
    return null;
  }
}

export async function setPendingReferral(code: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, code);
  } catch {
    /* storage unavailable: the person can enter it again from the Shar screen after signing up */
  }
}

export async function clearPendingReferral(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* nothing to clear */
  }
}

export type ReferralOutcome = 'none' | 'applied' | 'already' | 'rejected' | 'retry';

type Call = <T>(path: string, options?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => Promise<T>;

/**
 * Sends the saved code to the server once the person is signed in.
 *  applied   the code worked (they are now a companion of whoever shared it)
 *  already   they had already used a code: nothing to do
 *  rejected  the server says it isn't a valid code (or it is their own)
 *  retry     the server or network failed: the code is kept for the next try
 */
export async function applyPendingReferral(call: Call): Promise<ReferralOutcome> {
  const code = await getPendingReferral();
  if (!code) return 'none';
  try {
    await call<{ ok: true }>('/api/shar/referral', { method: 'POST', body: { code } });
    await clearPendingReferral();
    return 'applied';
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 409) {
        await clearPendingReferral();
        return 'already';
      }
      if (e.status === 400 || e.status === 404) {
        await clearPendingReferral();
        return 'rejected';
      }
    }
    return 'retry';
  }
}
