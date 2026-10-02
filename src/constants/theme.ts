/**
 * Bluvfi design system v1.0.0 — dark-native, mono-accented, precision-built.
 * Single dark theme (no light mode) per the design system spec.
 */

export const Colors = {
  blue: '#0A0AE8',
  blueDeep: '#0000CC',
  sage: '#8FAE82',
  sageLight: '#AFC69F',
  gold: '#C9A84C',
  redAlert: '#E05252',
  amber: '#E8A838',

  bg0: '#0F100D',
  bg1: '#1B1C19',
  bg2: '#252620',
  bg3: '#2E2F2A',

  tx0: '#F2F0E8',
  tx1: '#A7A79A',
  tx2: '#6B6B62',

  border: 'rgba(242, 240, 232, 0.10)',
  borderSage: 'rgba(143, 174, 130, 0.25)',
  borderGold: 'rgba(201, 168, 76, 0.30)',
} as const;

export const Radii = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  xxl: 16,
  xxxl: 24,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Durations = {
  instant: 80,
  fast: 150,
  standard: 250,
  slow: 400,
} as const;

/** Font family names registered via expo-font in app/_layout.tsx. */
export const Fonts = {
  sansRegular: 'DMSans_400Regular',
  sansMedium: 'DMSans_500Medium',
  sansSemiBold: 'DMSans_600SemiBold',
  sansBold: 'DMSans_700Bold',
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
} as const;

/**
 * Typography scale — the design system PDF's hierarchy and families, with sizes raised for phones.
 * The PDF's literal point values (body 10, small 8.5, label 8) are print-page sizes and were
 * unreadable on a device, so the small steps are lifted to mobile-legible minimums
 * (body 14, small 12, label 11) and the headings scaled to keep the same ratios.
 */
export const Type = {
  display: { fontFamily: Fonts.sansBold, fontSize: 34, letterSpacing: -1.36 },
  h1: { fontFamily: Fonts.sansBold, fontSize: 24, letterSpacing: -0.72 },
  h2: { fontFamily: Fonts.sansSemiBold, fontSize: 18, letterSpacing: -0.36 },
  h3: { fontFamily: Fonts.sansSemiBold, fontSize: 15, letterSpacing: -0.15 },
  body: { fontFamily: Fonts.sansRegular, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: Fonts.sansRegular, fontSize: 12 },
  label: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase' as const },
  amount: { fontFamily: Fonts.monoBold, fontSize: 24 },
} as const;

export const BottomNavHeight = 64;
