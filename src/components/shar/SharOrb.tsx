import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { SharColors } from '@/constants/shar';

/**
 * Shar: the glowing blue orb of light, with a faint trail behind it. Drawn here (not an image) so it stays sharp at every size
 * and uses the design system's brand blue. It breathes and drifts slowly; with the system's reduce-motion setting on it holds still.
 *
 * `size` is the full square including the halo, so the orb itself fills a bit under half of it.
 */
export function SharOrb({ size = 96, animated = true }: { size?: number; animated?: boolean }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!animated || reduced) return;
    pulse.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [animated, reduced, pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + 0.28 * pulse.value,
    transform: [{ scale: 0.94 + 0.12 * pulse.value }],
  }));
  const driftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -size * 0.02 + size * 0.04 * pulse.value }],
  }));

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel="Shar">
      <Animated.View style={[StyleSheet.absoluteFill, haloStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="halo" cx="56" cy="44" r="46" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={SharColors.haloInner} />
              <Stop offset="0.45" stopColor={SharColors.haloMid} />
              <Stop offset="1" stopColor={SharColors.deep} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="56" cy="44" r="46" fill="url(#halo)" />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="core" cx="51" cy="38" r="22" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.28" stopColor={SharColors.core} />
              <Stop offset="0.62" stopColor={SharColors.glow} />
              <Stop offset="1" stopColor={SharColors.body} />
            </RadialGradient>
            <LinearGradient id="tail" x1="6" y1="80" x2="46" y2="52" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={SharColors.glow} stopOpacity={0} />
              <Stop offset="1" stopColor={SharColors.glow} stopOpacity={0.75} />
            </LinearGradient>
          </Defs>
          {/* The trail: a tapered curl of light, thinnest at the far end. */}
          <Path d="M5 82 C 20 77 33 66 46 53 C 40 67 28 78 5 82 Z" fill="url(#tail)" />
          {/* Stray sparks along the path. */}
          <Circle cx="20" cy="72" r="1.3" fill={SharColors.core} opacity={0.55} />
          <Circle cx="31" cy="66" r="1" fill={SharColors.core} opacity={0.7} />
          <Circle cx="14" cy="80" r="0.9" fill={SharColors.glow} opacity={0.45} />
          {/* A thin ring, as light bending around the orb. */}
          <Circle cx="56" cy="44" r="21" fill="none" stroke={SharColors.glow} strokeOpacity={0.3} strokeWidth="0.8" />
          <Circle cx="56" cy="44" r="14.5" fill="url(#core)" />
          <Ellipse cx="51.5" cy="38.5" rx="4.2" ry="3" fill="#FFFFFF" opacity={0.85} />
        </Svg>
      </Animated.View>
    </View>
  );
}
