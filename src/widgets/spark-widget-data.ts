import * as SecureStore from 'expo-secure-store';
import { dayBefore, liveStreak, sparkDay } from '@/lib/spark-streak';

/**
 * What the home-screen widget shows, and how it stays right with no network. The app saves a small snapshot whenever the Daily Spark
 * changes (see sync-spark-widget.tsx); the widget works out from it, and from today's date, what to say. So when midnight UTC passes the
 * widget flips to "Tap to collect" by itself, and a broken streak reads 0, without the app being open.
 */

const KEY = 'bluvfi.spark-widget';

export interface SparkWidgetSnapshot {
  /** The UTC day this was saved. */
  day: string;
  /** The live streak when it was saved, and whether today's spark was already collected. */
  streak: number;
  collectedToday: boolean;
  seeker: boolean;
}

export interface SparkWidgetView {
  streak: number;
  collected: boolean;
  headline: string;
  status: string;
  /** True when there is nothing saved yet (the person has not opened the app signed in). */
  empty: boolean;
}

/** The last day a spark was collected, as far as the snapshot knows. */
function lastDayOf(s: SparkWidgetSnapshot): { day: string; streak: number } | null {
  if (s.collectedToday) return { day: s.day, streak: s.streak };
  if (s.streak > 0) return { day: dayBefore(s.day), streak: s.streak };
  return null;
}

/** What to show right now, from what was saved. Never throws, and a missing snapshot reads as a gentle invitation. */
export function viewFor(snapshot: SparkWidgetSnapshot | null, now: Date = new Date()): SparkWidgetView {
  if (!snapshot) return { streak: 0, collected: false, headline: 'Daily Spark', status: 'Open Bluvfi to start', empty: true };
  const live = liveStreak(lastDayOf(snapshot), sparkDay(now));
  return {
    streak: live.streak,
    collected: live.collectedToday,
    headline: live.streak === 1 ? '1 day streak' : `${live.streak} day streak`,
    status: live.collectedToday ? 'Collected today' : live.streak > 0 ? 'Tap to keep your streak' : 'Tap to collect',
    empty: false,
  };
}

export async function loadSnapshot(): Promise<SparkWidgetSnapshot | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<SparkWidgetSnapshot>;
    if (typeof j.day === 'string' && typeof j.streak === 'number' && typeof j.collectedToday === 'boolean') {
      return { day: j.day, streak: j.streak, collectedToday: j.collectedToday, seeker: j.seeker === true };
    }
  } catch {
    /* unreadable: treat as nothing saved */
  }
  return null;
}

export async function saveSnapshot(s: SparkWidgetSnapshot): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(s));
  } catch {
    /* the widget just keeps what it had */
  }
}

/** Forgets what was saved (on sign-out), so the widget doesn't show the last person's streak. */
export async function clearSnapshot(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* nothing to forget */
  }
}
