import { Colors } from './theme';

/**
 * Shar's light, built from the design system's own brand blue so it sits in the same palette as everything else:
 * a bright core that falls off into the brand blue, with a soft halo, like the wisp of light in the story.
 */
export const SharColors = {
  /** Hot centre of the orb. */
  core: '#F4F8FF',
  /** The glow around the core. */
  glow: '#9DB8FF',
  /** Body of the orb, a lifted brand blue. */
  body: '#4352FF',
  /** The rim, straight from the design system. */
  deep: Colors.blue,
  haloInner: 'rgba(143, 176, 255, 0.55)',
  haloMid: 'rgba(10, 10, 232, 0.28)',
  /** Fills and hairlines that tint the surrounding cards. */
  tint: 'rgba(10, 10, 232, 0.14)',
  tintBorder: 'rgba(143, 176, 255, 0.28)',
  /** Pending Shar: amber from the design system. */
  pending: Colors.amber,
} as const;

/** A Seeker's light: whiter at the heart, a wider and stronger halo, and a pale outer glow. */
export const SeekerColors = {
  core: '#FFFFFF',
  haloInner: 'rgba(214, 228, 255, 0.9)',
  haloMid: 'rgba(120, 150, 255, 0.5)',
  outerGlow: 'rgba(157, 184, 255, 0.22)',
  spark: '#FFFFFF',
} as const;

/** The ladder, in the story's terms. Mirrors TIERS in the server's src/lib/shar-rules.ts. */
export const SHAR_TIER_BLURB: Record<string, string> = {
  spark: 'Every journey starts with a spark.',
  wisp: 'Light enough to follow.',
  guide: 'You light the way for others now.',
  seeker: 'You carry the light all the way.',
};
