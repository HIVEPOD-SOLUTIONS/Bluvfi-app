import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { pollInbox } from '@/lib/inbox-poll';

/**
 * The background check for alerts. Android runs it on its own schedule (no sooner than every 15 minutes, and only when it suits the
 * battery and network), even when the app is closed, until the person force-stops the app or turns alerts off. It is defined here, at the
 * top level of a module the app's entry file loads, because the system can start it before any screen exists.
 *
 * Both packages are native modules, so a build made before they were added doesn't have them. The entry file and the app load this file
 * defensively; without it alerts are simply checked when the app opens.
 */
export const INBOX_TASK = 'bluvfi-inbox';
/** Android's own minimum between runs, in minutes. */
export const INBOX_INTERVAL_MIN = 15;

TaskManager.defineTask(INBOX_TASK, async () => {
  try {
    await pollInbox();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Asks Android to run the check regularly. Safe to call again (it replaces itself), so the app does it on each launch while alerts are on. */
export async function startInboxTask(): Promise<void> {
  await BackgroundTask.registerTaskAsync(INBOX_TASK, { minimumInterval: INBOX_INTERVAL_MIN });
}

export async function stopInboxTask(): Promise<void> {
  await BackgroundTask.unregisterTaskAsync(INBOX_TASK).catch(() => {});
}
