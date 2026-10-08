import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { SplashScreen } from 'expo-router';

/** The launch screen's blue; the same value app.json gives the native splash, so the hand-over from the native one is invisible. */
export const SPLASH_BLUE = '#0000CC';
/** The logo's width, the same as the native splash's imageWidth in app.json. */
export const SPLASH_LOGO_SIZE = 200;
/** Shown at least this long once it has started, so the motion reads as a moment and not a flicker. */
export const SPLASH_MIN_MS = 900;
/** The cross-fade into the app. */
export const SPLASH_FADE_MS = 350;

/**
 * The launch screen while the app signs the person in. The native splash is a still image (Android can't animate it), so as soon as the
 * app is running this takes over with the identical picture and brings the logo to life: it breathes, and soft rings of light ripple out
 * from it. When the app is ready it fades into the app. With the system's reduce-motion setting on, the logo holds still.
 */
export function BrandSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const reduced = useReducedMotion();
  const startedAt = useRef(Date.now());
  const [leaving, setLeaving] = useState(false);

  const breath = useSharedValue(0);
  const ripple = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    breath.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) })), -1);
    ripple.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.out(Easing.quad) }), -1);
  }, [reduced, breath, ripple]);

  // Once the app is ready (and the animation has had its minimum moment), fade out and tell the parent to remove this.
  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - startedAt.current));
    const start = setTimeout(() => {
      setLeaving(true);
      opacity.value = withTiming(0, { duration: SPLASH_FADE_MS });
    }, wait);
    const done = setTimeout(onDone, wait + SPLASH_FADE_MS + 30);
    return () => {
      clearTimeout(start);
      clearTimeout(done);
    };
  }, [ready, onDone, opacity]);

  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.08 * breath.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - ripple.value), transform: [{ scale: 0.8 + 0.9 * ripple.value }] }));
  const ringStyle2 = useAnimatedStyle(() => {
    const p = (ripple.value + 0.5) % 1; // the second ring runs half a cycle behind the first
    return { opacity: 0.35 * (1 - p), transform: [{ scale: 0.8 + 0.9 * p }] };
  });
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.screen, fadeStyle]}
      pointerEvents={leaving ? 'none' : 'auto'}
      // The native splash goes away only once this is on screen, so there is never a gap between the two.
      onLayout={() => void SplashScreen.hideAsync()}
    >
      <View style={styles.center}>
        {reduced ? null : (
          <>
            <Animated.View style={[styles.ring, ringStyle]} />
            <Animated.View style={[styles.ring, ringStyle2]} />
          </>
        )}
        <Animated.View style={logoStyle}>
          <Image source={require('../../../assets/images/splash-icon.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Bluvfi" />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: SPLASH_BLUE, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  center: { width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE, alignItems: 'center', justifyContent: 'center' },
  logo: { width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE },
  ring: { position: 'absolute', width: SPLASH_LOGO_SIZE * 0.7, height: SPLASH_LOGO_SIZE * 0.7, borderRadius: SPLASH_LOGO_SIZE, borderWidth: 2, borderColor: '#FFFFFF' },
});
