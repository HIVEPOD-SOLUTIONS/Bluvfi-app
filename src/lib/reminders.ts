import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type * as ExpoNotifications from 'expo-notifications';

/**
 * Reminders: a "your streak is about to end" nudge for the Daily Spark and a "the weekly trial is about to reset" nudge. They are local
 * notifications, scheduled on the phone, so they need no push server and no Firebase. (Notifications another person or the server
 * triggers, like "your claim was paid", would need push; those are not here.)
 *
 * expo-notifications is a native module: a build made before it was added doesn't contain it, and importing it there throws at startup.
 * It is loaded defensively; without it the reminders are simply unavailable and nothing else changes (same approach as expo-audio).
 */
let N: typeof ExpoNotifications | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  N = Platform.OS === 'android' ? (require('expo-notifications') as typeof ExpoNotifications) : null;
} catch {
  N = null;
}

export const remindersAvailable = N !== null;

const CHANNEL = 'spark';
const STREAK_ID = 'bluvfi-spark-streak';
const TRIAL_ID = 'bluvfi-trial-reset';
const PREF_KEY = 'bluvfi.reminders';

/** A streak reminder goes out this many hours before the Spark resets at 00:00 UTC. */
export const STREAK_REMINDER_HOURS_BEFORE = 3;
/** The weekly trial resets Monday 00:00 UTC; its reminder goes out this many hours before. */
export const TRIAL_REMINDER_HOURS_BEFORE = 6;

const HOUR = 3_600_000;

/** The coming 00:00 UTC. */
function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/**
 * When the streak reminder should go out: the last few hours before the next reset, but never for a spark that is already collected
 * (that one is about tomorrow's, so it waits for tomorrow's window). Always in the future.
 */
export function streakReminderAt(now: Date, collectedToday: boolean): Date {
  const resetToday = nextUtcMidnight(now);
  let at = new Date(resetToday.getTime() - STREAK_REMINDER_HOURS_BEFORE * HOUR);
  if (collectedToday || at.getTime() <= now.getTime() + 60_000) at = new Date(at.getTime() + 24 * HOUR);
  return at;
}

/** The coming Monday 00:00 UTC (the weekly trial's reset). */
export function nextTrialReset(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday + 7);
  return d;
}

/** When the trial reminder should go out: a few hours before the reset, in the future (if that has passed, the week after's). */
export function trialReminderAt(now: Date): Date {
  let at = new Date(nextTrialReset(now).getTime() - TRIAL_REMINDER_HOURS_BEFORE * HOUR);
  if (at.getTime() <= now.getTime() + 60_000) at = new Date(at.getTime() + 7 * 24 * HOUR);
  return at;
}

const clock = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** The words of the streak reminder. Says when the spark resets in the person's own clock. */
export function streakReminderCopy(streak: number, resetsAt: Date): { title: string; body: string } {
  return streak > 0
    ? { title: `Your ${streak}-day streak ends soon`, body: `Tap the orb before ${clock(resetsAt)} to keep it going.` }
    : { title: 'Your Daily Spark is waiting', body: `Collect it before ${clock(resetsAt)} and start a streak.` };
}

export const trialReminderCopy = (): { title: string; body: string } => ({
  title: 'The weekly trial resets soon',
  body: 'A few hours left to climb the board before it starts over.',
});

// ── What the person chose ──────────────────────────────────────────────────────

let enabled = false;
let loading: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Whether the person turned reminders on (off until they do). Read once; never throws. */
export function loadRemindersPref(): Promise<boolean> {
  if (!loading) {
    loading = SecureStore.getItemAsync(PREF_KEY)
      .then((v) => {
        const on = v === 'on';
        if (on !== enabled) {
          enabled = on;
          emit();
        }
        return enabled;
      })
      .catch(() => enabled);
  }
  return loading;
}

export const remindersEnabled = () => enabled;
export const subscribeReminders = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

function save(on: boolean) {
  enabled = on;
  emit();
  SecureStore.setItemAsync(PREF_KEY, on ? 'on' : 'off').catch(() => {});
}

let configured = false;
async function configure(): Promise<void> {
  if (!N || configured) return;
  configured = true;
  // Show a reminder even while the app is open, as a banner.
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
  // The channel has to exist before Android 13 will show its permission prompt.
  await N.setNotificationChannelAsync(CHANNEL, { name: 'Shar reminders', importance: N.AndroidImportance.DEFAULT }).catch(() => {});
}

/** Asks for permission (the system prompt on Android 13 and up) and turns reminders on. Resolves false if they said no or it's unavailable. */
export async function turnOnReminders(): Promise<boolean> {
  if (!N) return false;
  try {
    await configure();
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
    if (status !== 'granted') return false;
    save(true);
    return true;
  } catch {
    return false;
  }
}

export async function turnOffReminders(): Promise<void> {
  save(false);
  if (!N) return;
  await Promise.all([N.cancelScheduledNotificationAsync(STREAK_ID), N.cancelScheduledNotificationAsync(TRIAL_ID)]).catch(() => {});
}

/**
 * Replaces the two pending reminders with ones for the current state. Safe to call as often as needed: each has a fixed id, so there is
 * only ever one of each waiting. Does nothing unless reminders are on and allowed.
 */
export async function syncReminders(state: { collectedToday: boolean; streak: number }, now: Date = new Date()): Promise<void> {
  if (!N || !enabled) return;
  try {
    await configure();
    const { status } = await N.getPermissionsAsync();
    if (status !== 'granted') return;
    const streakAt = streakReminderAt(now, state.collectedToday);
    const resets = new Date(streakAt.getTime() + STREAK_REMINDER_HOURS_BEFORE * HOUR);
    // Either way the streak at risk is the one they have now: tomorrow's reminder, if today's is collected, is about keeping that one alive.
    const copy = streakReminderCopy(state.streak, resets);
    await N.cancelScheduledNotificationAsync(STREAK_ID).catch(() => {});
    await N.scheduleNotificationAsync({
      identifier: STREAK_ID,
      content: { ...copy, data: { url: 'bluvfi://spark' } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: streakAt, channelId: CHANNEL },
    });
    const trial = trialReminderCopy();
    await N.cancelScheduledNotificationAsync(TRIAL_ID).catch(() => {});
    await N.scheduleNotificationAsync({
      identifier: TRIAL_ID,
      content: { ...trial, data: { url: 'bluvfi://spark' } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: trialReminderAt(now), channelId: CHANNEL },
    });
  } catch (err) {
    console.warn('[reminders] could not schedule:', err);
  }
}

/** Calls `onOpen` when someone taps one of the reminders (so the app can open the Spark screen). Returns the way to stop listening. */
export function listenForReminderTaps(onOpen: (url: string) => void): () => void {
  if (!N) return () => {};
  const sub = N.addNotificationResponseReceivedListener((r) => {
    const url = (r.notification.request.content.data as { url?: unknown } | undefined)?.url;
    if (typeof url === 'string') onOpen(url);
  });
  return () => sub.remove();
}

/**
 * This phone's Firebase Cloud Messaging token, which is how the server can send it a notification (a claim paid, a provider used).
 * null when push isn't set up in this build (no Firebase configuration in it) or the person refused: reminders still work without it.
 */
export async function getPushToken(): Promise<string | null> {
  if (!N) return null;
  try {
    const t = await N.getDevicePushTokenAsync();
    return typeof t.data === 'string' && t.data.length > 0 ? t.data : null;
  } catch {
    return null;
  }
}
