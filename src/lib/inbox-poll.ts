import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '@/lib/api';
import { showNow } from '@/lib/reminders';

/**
 * Alerts with no push service and no account to set up. When someone turns alerts on, the server hands this phone a secret key; from then on
 * the phone asks the server "anything new for me?" (in the background about every 15 minutes at best, as Android allows, and whenever the
 * app opens) and shows each answer as a notification. Nothing here talks to Google, Firebase or any push service.
 *
 * The key reads the person's notification text and nothing else (a title, a short line, a screen to open). It lives in secure storage and is
 * revoked on the server when alerts are turned off. The trade-off against a push service: not instant. An alert shows up the next time the
 * phone checks.
 */

const KEY_STORE = 'bluvfi.inbox-key';
const CURSOR_STORE = 'bluvfi.inbox-cursor';

export interface InboxItem {
  id: number;
  title: string;
  body: string;
  url: string | null;
  at: string;
}

export type PollStatus = 'ok' | 'off' | 'revoked' | 'error';

/** Everything a poll touches, so it can be tested without a phone or a network. */
export interface PollDeps {
  fetchFn: typeof fetch;
  show: (item: InboxItem) => Promise<unknown>;
  storage: { get: (k: string) => Promise<string | null>; set: (k: string, v: string) => Promise<void>; remove: (k: string) => Promise<void> };
}

const realDeps = (): PollDeps => ({
  fetchFn: fetch,
  show: (item) => showNow(item),
  storage: {
    get: (k) => SecureStore.getItemAsync(k).catch(() => null),
    set: (k, v) => SecureStore.setItemAsync(k, v).catch(() => {}),
    remove: (k) => SecureStore.deleteItemAsync(k).catch(() => {}),
  },
});

/** Remembers the key the server gave this phone, and where its inbox was at that moment (so nothing older is shown). */
export async function saveInbox(key: string, cursor: number, deps: PollDeps = realDeps()): Promise<void> {
  await deps.storage.set(KEY_STORE, key);
  await deps.storage.set(CURSOR_STORE, String(Math.max(0, Math.floor(cursor))));
}

export async function loadInboxKey(deps: PollDeps = realDeps()): Promise<string | null> {
  return deps.storage.get(KEY_STORE);
}

/** Forgets the key (alerts off, or the server says it is no longer valid). */
export async function clearInbox(deps: PollDeps = realDeps()): Promise<void> {
  await deps.storage.remove(KEY_STORE);
  await deps.storage.remove(CURSOR_STORE);
}

/**
 * Asks the server for anything new and shows it. Safe to call as often as you like (it only ever shows an alert once, because the cursor
 * moves past it). Never throws: a failed check just means trying again next time.
 */
export async function pollInbox(deps: PollDeps = realDeps()): Promise<{ status: PollStatus; shown: number }> {
  try {
    const key = await deps.storage.get(KEY_STORE);
    if (!key) return { status: 'off', shown: 0 };
    const after = Number(await deps.storage.get(CURSOR_STORE)) || 0;
    const res = await deps.fetchFn(`${API_BASE_URL}/api/notifications/inbox?after=${after}`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) {
      // The server doesn't know this key any more (turned off from another screen, or an account clean-up): stop asking.
      await clearInbox(deps);
      return { status: 'revoked', shown: 0 };
    }
    if (!res.ok) return { status: 'error', shown: 0 };
    const data = (await res.json()) as { items?: InboxItem[]; cursor?: number };
    const items = Array.isArray(data.items) ? data.items : [];
    let shown = 0;
    for (const item of items) {
      // Move the cursor first for each one, so an alert that crashes while showing is never shown twice.
      await deps.storage.set(CURSOR_STORE, String(item.id));
      if (typeof item.title === 'string' && typeof item.body === 'string' && (await deps.show(item))) shown++;
    }
    if (typeof data.cursor === 'number' && data.cursor > after) await deps.storage.set(CURSOR_STORE, String(data.cursor));
    return { status: 'ok', shown };
  } catch {
    return { status: 'error', shown: 0 };
  }
}
