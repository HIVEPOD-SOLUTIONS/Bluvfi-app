import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { CardIllustration, OrbIllustration, ShieldIllustration } from '@/components/onboarding/illustrations';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';

/** Same three themes as bluvfi web's onboarding, laid out like the reference: illustration, chip, heading. */
const SLIDES = [
  {
    chip: 'Welcome to Bluvfi',
    heading: 'Your AI finance\nassistant',
    Illustration: OrbIllustration,
  },
  {
    chip: 'Bills & investments',
    heading: 'Pay bills and invest,\npowered by USDC',
    Illustration: CardIllustration,
  },
  {
    chip: 'Non-custodial',
    heading: 'Your keys. Your money.\nAlways.',
    Illustration: ShieldIllustration,
  },
];

const TRACK_WIDTH = 66;
const THUMB_WIDTH = TRACK_WIDTH / SLIDES.length;

function TopGlow() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height={380} pointerEvents="none">
      <Defs>
        <RadialGradient id="glow" cx="0.5" cy="0" r="0.75">
          <Stop offset="0" stopColor={Colors.blue} stopOpacity="0.45" />
          <Stop offset="1" stopColor={Colors.blue} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#glow)" />
    </Svg>
  );
}

function ArrowRight() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M3 9h12M10 4l5 5-5 5" stroke={Colors.bg0} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollX = useRef(new Animated.Value(0)).current;

  const thumbTranslate = scrollX.interpolate({
    inputRange: [0, width * (SLIDES.length - 1)],
    outputRange: [0, TRACK_WIDTH - THUMB_WIDTH],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <TopGlow />

      <Animated.ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        style={styles.slides}
      >
        {SLIDES.map((slide) => (
          <View key={slide.chip} style={[styles.slide, { width, paddingTop: insets.top + Spacing.xl }]}>
            <View style={styles.illustration}>
              <slide.Illustration />
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{slide.chip}</Text>
            </View>
            <Text style={styles.heading}>{slide.heading}</Text>
          </View>
        ))}
      </Animated.ScrollView>

      <View style={styles.track}>
        <Animated.View style={[styles.thumb, { transform: [{ translateX: thumbTranslate }] }]} />
      </View>

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.sm }]}>
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
          onPress={() => router.push({ pathname: '/login', params: { mode: 'signup' } })}
        >
          <Text style={styles.primaryText}>Create Account</Text>
          <ArrowRight />
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/login', params: { mode: 'login' } })} hitSlop={12}>
          <Text style={styles.loginLink}>Log in</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg0,
  },
  slides: {
    flex: 1,
  },
  slide: {
    paddingHorizontal: Spacing.xxl,
    justifyContent: 'flex-end',
  },
  illustration: {
    flex: 1,
    marginHorizontal: -Spacing.xxl,
    marginBottom: Spacing.md,
  },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.bg1,
    borderRadius: Radii.sm,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  chipText: {
    fontFamily: Fonts.sansRegular,
    fontSize: 15,
    color: Colors.tx1,
  },
  heading: {
    ...Type.display,
    fontSize: 32,
    lineHeight: 38,
    color: Colors.tx0,
    marginBottom: Spacing.xl,
  },
  track: {
    width: TRACK_WIDTH,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.bg3,
    overflow: 'hidden',
    marginLeft: Spacing.xxl,
    marginBottom: Spacing.xxxl + Spacing.lg,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.tx0,
  },
  actions: {
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.xl,
  },
  primary: {
    width: '100%',
    height: 58,
    borderRadius: Radii.xxl,
    backgroundColor: Colors.tx0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  primaryText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 16,
    color: Colors.bg0,
  },
  loginLink: {
    fontFamily: Fonts.sansMedium,
    fontSize: 16,
    color: Colors.tx0,
    textDecorationLine: 'underline',
  },
});
