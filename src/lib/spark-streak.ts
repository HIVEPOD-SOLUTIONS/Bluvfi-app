/**
 * The few Daily Spark day rules the phone needs without asking the server: which UTC day it is, and whether a streak is still alive on
 * a given day. The server decides what a spark pays and when a streak breaks (web src/lib/shar-spark-rules.ts); this is the same
 * rule so something that can't ask the server, like the home-screen widget, stays right when the day rolls over. A test keeps the
 * two copies identical.
 */

/** The UTC day a moment falls in, as YYYY-MM-DD. */
export function sparkDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The day before a YYYY-MM-DD day. */
export function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The streak a person has on `today`: it survives until the end of the day after their last spark, then it is 0. */
export function liveStreak(last: { day: string; streak: number } | null, today: string): { streak: number; collectedToday: boolean } {
  if (!last) return { streak: 0, collectedToday: false };
  if (last.day === today) return { streak: last.streak, collectedToday: true };
  if (last.day === dayBefore(today)) return { streak: last.streak, collectedToday: false };
  return { streak: 0, collectedToday: false };
}
