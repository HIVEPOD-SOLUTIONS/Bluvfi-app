/** "3d 4h" / "5h 12m" / "9m" until an ISO time, or "soon" once it has passed. */
export function timeLeft(iso: string, now: number = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (!(ms > 0)) return 'soon';
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${mins % 60}m` : `${Math.max(1, mins)}m`;
}
