import { microToUsd } from '@/lib/money';

/**
 * How the activity feed is shown: grouped by day, signed amounts, plain-language states. Pure, so it can be tested. The feed itself
 * comes from the server (GET /api/activity/feed).
 */

export type ActivitySource = 'all' | 'shar' | 'credits' | 'commission';
export const ACTIVITY_SOURCES: { key: ActivitySource; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'shar', label: 'Shar' },
  { key: 'credits', label: 'Credits' },
  { key: 'commission', label: 'Commission' },
];

export type ActivityKind = 'purchase' | 'provider' | 'claim' | 'topup' | 'call' | 'refund' | 'earned' | 'withdrawal';
export type ActivityState = 'done' | 'pending' | 'review' | 'sending' | 'rejected';

export interface ActivityItem {
  id: string;
  source: Exclude<ActivitySource, 'all'>;
  kind: ActivityKind;
  title: string;
  subtitle: string | null;
  /** Signed. Shar, or micro-USDC when `unit` is "usd". */
  amount: number;
  unit: 'shar' | 'usd';
  state: ActivityState;
  at: string;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
  /** False when part of the history can't be read yet because the server's setup isn't finished. */
  ready: boolean;
}

export const isActivitySource = (v: unknown): v is ActivitySource => ACTIVITY_SOURCES.some((s) => s.key === v);

// ── days ──────────────────────────────────────────────────────────────────────

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 86_400_000;

/** "Today", "Yesterday", "Mon 5 Oct", or "5 Oct 2025" for another year: in the phone's own time zone. */
export function dayTitle(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-GB', sameYear ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).replace(',', '');
}

export interface ActivitySection {
  title: string;
  data: ActivityItem[];
}

/** Entries (already newest first) grouped under their day, keeping the order. */
export function groupByDay(items: ActivityItem[], now: Date = new Date()): ActivitySection[] {
  const sections: ActivitySection[] = [];
  for (const item of items) {
    const title = dayTitle(item.at, now);
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.data.push(item);
    else sections.push({ title, data: [item] });
  }
  return sections;
}

// ── amounts and states ────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('en-US');

export type Tone = 'positive' | 'negative' | 'muted' | 'pending';

/** "+25 Shar", "−1,500 Shar", "+$5.00", "−$0.05": and what colour it should be. A zero (a declined claim) is a dash. */
export function formatAmount(item: Pick<ActivityItem, 'amount' | 'unit' | 'state'>): { text: string; tone: Tone } {
  const a = item.amount;
  if (a === 0) return { text: '—', tone: 'muted' };
  const sign = a > 0 ? '+' : '−';
  const body = item.unit === 'shar' ? `${fmt(Math.abs(a))} Shar` : microToUsd(Math.abs(a));
  if (item.state === 'rejected') return { text: `${sign}${body}`, tone: 'muted' };
  if (item.state === 'pending' || item.state === 'review' || item.state === 'sending') return { text: `${sign}${body}`, tone: 'pending' };
  return { text: `${sign}${body}`, tone: a > 0 ? 'positive' : 'negative' };
}

export function stateLabel(state: ActivityState): string | null {
  switch (state) {
    case 'pending': return 'Pending';
    case 'review': return 'In review';
    case 'sending': return 'On its way';
    case 'rejected': return 'Declined';
    default: return null;
  }
}

/** "9:30 pm · Pending": the time of day, then the state when it isn't settled. */
export function rowSubtitle(item: Pick<ActivityItem, 'at' | 'state' | 'subtitle'>): string {
  const time = new Date(item.at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([ap])m/i, (_m, x: string) => ` ${x.toLowerCase()}m`);
  const state = stateLabel(item.state);
  return [time, item.subtitle, state].filter(Boolean).join(' · ');
}
