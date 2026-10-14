import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import { useApiClient } from './use-api';
import { useShar } from './use-shar';
import { getPushToken, listenForReminderTaps, loadRemindersPref, remindersAvailable, remindersEnabled, subscribeReminders, syncReminders, turnOffReminders, turnOnReminders } from '@/lib/reminders';
import { sparkDay } from '@/lib/spark-streak';
import { resetSparkWidget, syncSparkWidget } from '@/widgets/sync-spark-widget';

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
  /** The server can also reach this phone (claim paid, provider used). False when this build or the server isn't set up for push yet. */
  alerts: boolean;
}

/**
 * Whether reminders and alerts are on, and the way to switch them. Asking for permission happens when someone turns them on, never before.
 * Turning on also tells the server this phone's push address, when there is one.
 */
export function useReminders() {
  const on = useSyncExternalStore(subscribeReminders, remindersEnabled, remindersEnabled);
  const call = useApiClient();
  useEffect(() => {
    loadRemindersPref();
  }, []);

  const registerPush = useCallback(async (): Promise<boolean> => {
    const token = await getPushToken();
    if (!token) return false;
    try {
      await call('/api/push/register', { method: 'POST', body: { token } });
      return true;
    } catch {
      return false;
    }
  }, [call]);

  const turnOn = useCallback(async (): Promise<TurnOnResult> => {
    const reminders = await turnOnReminders();
    return { reminders, alerts: reminders ? await registerPush() : false };
  }, [registerPush]);

  const turnOff = useCallback(async () => {
    const token = await getPushToken();
    await turnOffReminders();
    if (token) await call('/api/push/register', { method: 'DELETE', body: { token } }).catch(() => {});
  }, [call]);

  return { on, available: remindersAvailable, turnOn, turnOff, registerPush };
}

/**
 * Keeps things that live outside the app in step with the Spark. Mounted once for the signed-in app:
 *  • the pending reminders (collecting today's moves the streak reminder to tomorrow, a new week moves the trial one);
 *  • this phone's push address on the server (re-sent each launch, as Firebase can change it);
 *  • the home-screen widget's streak;
 *  • and it opens the right screen when a notification is tapped.
 */
export function useReminderSync() {
  const { on, registerPush } = useReminders();
  const spark = useShar().data?.spark;
  const collectedToday = spark?.collectedToday;
  const streak = spark?.streak;
  const seeker = spark?.seeker;

  useEffect(() => {
    if (!on || collectedToday === undefined || streak === undefined) return;
    syncReminders({ collectedToday, streak });
  }, [on, collectedToday, streak]);

  const registered = useRef(false);
  useEffect(() => {
    if (!on || registered.current) return;
    registered.current = true;
    registerPush();
  }, [on, registerPush]);

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
