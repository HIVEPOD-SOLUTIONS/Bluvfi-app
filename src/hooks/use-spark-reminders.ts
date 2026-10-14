import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useApiClient } from './use-api';
import { useShar } from './use-shar';
import { clearInbox, loadInboxKey, pollInbox, saveInbox } from '@/lib/inbox-poll';
import { listenForReminderTaps, loadRemindersPref, remindersAvailable, remindersEnabled, subscribeReminders, syncReminders, turnOffReminders, turnOnReminders } from '@/lib/reminders';
import { sparkDay } from '@/lib/spark-streak';
import { resetSparkWidget, syncSparkWidget } from '@/widgets/sync-spark-widget';

/**
 * The background check is a native module: a build made before it was added doesn't have it. Load it defensively; without it alerts are
 * still fetched whenever the app opens, and nothing else changes (same approach as expo-audio and the widget).
 */
type InboxTask = typeof import('@/lib/inbox-task');
let task: InboxTask | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  task = require('@/lib/inbox-task') as InboxTask;
} catch {
  task = null;
}

/** The screens a notification may open. Anything else it carries is ignored, so a notification can never send the app somewhere unexpected. */
export const NOTIFICATION_SCREENS: Record<string, string> = {
  'bluvfi://spark': '/spark',
  'bluvfi://shar': '/shar',
  'bluvfi://network': '/network',
  'bluvfi://activity': '/activity',
};

export interface TurnOnResult {
  /** The phone's own reminders (the streak and the weekly trial) are on. */
  reminders: boolean;
  /** Alerts from the server (a claim paid, a provider used) are on: this phone has its key and checks for them. */
  alerts: boolean;
}

/**
 * Whether reminders and alerts are on, and the way to switch them. Asking for permission happens when someone turns them on, never before.
 * Turning on also asks the server for this phone's alert key, then starts the background check.
 */
export function useReminders() {
  const on = useSyncExternalStore(subscribeReminders, remindersEnabled, remindersEnabled);
  const call = useApiClient();
  useEffect(() => {
    loadRemindersPref();
  }, []);

  const enableAlerts = useCallback(async (): Promise<boolean> => {
    try {
      const made = await call<{ key: string; cursor: number }>('/api/notifications/key', { method: 'POST' });
      await saveInbox(made.key, made.cursor);
      await task?.startInboxTask().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }, [call]);

  const turnOn = useCallback(async (): Promise<TurnOnResult> => {
    const reminders = await turnOnReminders();
    return { reminders, alerts: reminders ? await enableAlerts() : false };
  }, [enableAlerts]);

  const turnOff = useCallback(async () => {
    const key = await loadInboxKey();
    await turnOffReminders();
    await task?.stopInboxTask();
    await clearInbox();
    if (key) await call('/api/notifications/key', { method: 'DELETE', body: { key } }).catch(() => {});
  }, [call]);

  return { on, available: remindersAvailable, turnOn, turnOff };
}

/**
 * Keeps things that live outside the app in step with the Spark. Mounted once for the signed-in app:
 *  • the pending reminders (collecting today's moves the streak reminder to tomorrow, a new week moves the trial one);
 *  • the alerts check: once on launch, whenever the app comes back to the front, and the background schedule restored;
 *  • the home-screen widget's streak;
 *  • and it opens the right screen when a notification is tapped.
 */
export function useReminderSync() {
  const { on } = useReminders();
  const spark = useShar().data?.spark;
  const collectedToday = spark?.collectedToday;
  const streak = spark?.streak;
  const seeker = spark?.seeker;

  useEffect(() => {
    if (!on || collectedToday === undefined || streak === undefined) return;
    syncReminders({ collectedToday, streak });
  }, [on, collectedToday, streak]);

  // Alerts: check now and each time the app comes to the front, and make sure Android is still running the background check.
  const restored = useRef(false);
  useEffect(() => {
    if (!on) return;
    pollInbox();
    if (!restored.current) {
      restored.current = true;
      loadInboxKey().then((key) => {
        if (key) task?.startInboxTask().catch(() => {});
      });
    }
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') pollInbox();
    });
    return () => sub.remove();
  }, [on]);

  useEffect(() => {
    if (collectedToday === undefined || streak === undefined) return;
    syncSparkWidget({ day: sparkDay(), streak, collectedToday, seeker: seeker === true });
  }, [collectedToday, streak, seeker]);
  // Signing out wipes the widget, so it never shows the last person's streak.
  useEffect(
    () => () => {
      resetSparkWidget();
    },
    [],
  );

  useEffect(
    () =>
      listenForReminderTaps((url) => {
        const screen = NOTIFICATION_SCREENS[url];
        if (screen) router.push(screen as never);
      }),
    [],
  );
}
