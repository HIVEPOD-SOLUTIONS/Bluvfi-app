/**
 * Shar celebrations: when Shar lands (a purchase, a companion's spending, a provider being used) or someone ranks up, the orb bursts
 * with its sound and a short animation. This file is the decision, with no React and no native code, so it can be tested: given what
 * was last seen and what has just loaded, is there something to celebrate?
 *
 * Collecting a Daily Spark has its own burst on the Spark screen, so those Shar are passed in as `ignore` and not celebrated twice.
 */

export const TIER_ORDER = ['spark', 'wisp', 'guide', 'seeker'] as const;
export type TierKey = (typeof TIER_ORDER)[number];

/** What is remembered between loads (and between launches) to tell a gain from a first look. */
export interface SharSeen {
  lifetime: number;
  tier: TierKey;
  /** Companion bonus and provider earnings, to say where a gain came from. */
  referralBonus: number;
  providerEarned: number;
}

export interface SharSnapshot extends SharSeen {
  tierName: string;
}

export type Celebration =
  | { kind: 'gain'; shar: number; source: 'purchase' | 'companion' | 'provider'; title: string; subtitle: string }
  | { kind: 'rank'; shar: number; tier: TierKey; title: string; subtitle: string };

const tierIndex = (t: string) => Math.max(0, TIER_ORDER.indexOf(t as TierKey));

/** Reads the three numbers this needs out of a loaded Shar summary. */
export function snapshotOf(data: {
  lifetime: number;
  tier: { tier: string; name: string };
  referral: { bonus: number };
  provider: { earned: number };
}): SharSnapshot {
  return {
    lifetime: data.lifetime,
    tier: TIER_ORDER[tierIndex(data.tier.tier)],
    tierName: data.tier.name,
    referralBonus: data.referral.bonus,
    providerEarned: data.provider.earned,
  };
}

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * The celebration, if any. Nothing on the very first look (`prev` null: there is nothing to compare with), nothing when the total
 * has not gone up, and a rank-up wins over a plain gain. `ignore` is Shar already celebrated elsewhere (a Daily Spark just collected).
 */
export function celebrationFor(prev: SharSeen | null, next: SharSnapshot, ignore = 0): Celebration | null {
  if (!prev) return null;
  const gain = Math.max(0, next.lifetime - prev.lifetime - Math.max(0, ignore));
  if (tierIndex(next.tier) > tierIndex(prev.tier)) {
    return { kind: 'rank', shar: gain, tier: next.tier, title: `You are now a ${next.tierName}`, subtitle: gain > 0 ? `+${fmt(gain)} Shar and a brighter light` : 'A brighter light' };
  }
  if (gain <= 0) return null;
  const fromCompanion = next.referralBonus > prev.referralBonus;
  const fromProvider = next.providerEarned > prev.providerEarned;
  if (fromCompanion && !fromProvider) return { kind: 'gain', shar: gain, source: 'companion', title: `+${fmt(gain)} Shar`, subtitle: 'A companion’s spending lit your way' };
  if (fromProvider && !fromCompanion) return { kind: 'gain', shar: gain, source: 'provider', title: `+${fmt(gain)} Shar`, subtitle: 'Someone used your provider' };
  return { kind: 'gain', shar: gain, source: 'purchase', title: `+${fmt(gain)} Shar`, subtitle: 'Earned from your purchase' };
}

// ── A tiny event bus, so any screen can celebrate and one host shows it ────────

type Listener = (c: Celebration) => void;
const listeners = new Set<Listener>();

export function onCelebrate(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function celebrate(c: Celebration): void {
  for (const fn of [...listeners]) fn(c);
}

// Shar already celebrated on its own screen, so the loader does not celebrate it a second time.
let ignored = 0;
export function ignoreNextGain(shar: number): void {
  ignored += Math.max(0, Math.floor(shar));
}
/**
 * Takes up to `gained` of the Shar waiting to be ignored. A reload that brought no new Shar takes nothing, so the ignore is still there
 * for the load that does carry the spark.
 */
export function consumeIgnoredGain(gained: number): number {
  const n = Math.min(ignored, Math.max(0, gained));
  ignored -= n;
  return n;
}
