import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { SeekerColors, SharColors } from '@/constants/shar';
import { useShar } from '@/hooks/use-shar';

/**
 * Shar: the glowing blue orb of light, with a faint trail behind it. Drawn here (not an image) so it stays sharp at every size
 * and uses the design system's brand blue. It breathes and drifts slowly; with the system's reduce-motion setting on it holds still.
 *
 * A Seeker (the top tier) gets a brighter light: a whiter heart, a stronger halo with a pale glow beyond it, a quicker breath and twinkling sparks.
 * It follows the signed-in person's tier on its own; pass `bright` to force it either way.
 *
 * `size` is the full square including the halo, so the orb itself fills a bit under half of it.
 */
export function SharOrb({ size = 96, animated = true, bright }: { size?: number; animated?: boolean; bright?: boolean }) {
  const tier = useShar().data?.tier.tier;
  const seeker = bright ?? tier === 'seeker';
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!animated || reduced) return;
    pulse.value = withRepeat(withTiming(1, { duration: seeker ? 1700 : 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [animated, reduced, seeker, pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: (seeker ? 0.86 : 0.72) + (seeker ? 0.14 : 0.28) * pulse.value,
    transform: [{ scale: 0.94 + (seeker ? 0.16 : 0.12) * pulse.value }],
  }));
  const sparkStyle = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * pulse.value }));
  const driftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -size * 0.02 + size * 0.04 * pulse.value }],
  }));

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel="Shar">
      <Animated.View style={[StyleSheet.absoluteFill, haloStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="halo" cx="56" cy="44" r="46" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={seeker ? SeekerColors.haloInner : SharColors.haloInner} />
              <Stop offset="0.45" stopColor={seeker ? SeekerColors.haloMid : SharColors.haloMid} />
              <Stop offset="1" stopColor={SharColors.deep} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {seeker ? <Circle cx="56" cy="44" r="49" fill={SeekerColors.outerGlow} /> : null}
          <Circle cx="56" cy="44" r="46" fill="url(#halo)" />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="core" cx="51" cy="38" r="22" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset={seeker ? '0.4' : '0.28'} stopColor={seeker ? SeekerColors.core : SharColors.core} />
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
          <Circle cx="56" cy="44" r="21" fill="none" stroke={SharColors.glow} strokeOpacity={seeker ? 0.6 : 0.3} strokeWidth={seeker ? '1.1' : '0.8'} />
          <Circle cx="56" cy="44" r="14.5" fill="url(#core)" />
          <Ellipse cx="51.5" cy="38.5" rx="4.2" ry="3" fill="#FFFFFF" opacity={0.85} />
        </Svg>
      </Animated.View>

      {seeker ? (
        <Animated.View style={[StyleSheet.absoluteFill, sparkStyle]} pointerEvents="none">
          <Svg width={size} height={size} viewBox="0 0 100 100">
            {/* Four-point twinkles around the orb. */}
            <Path d="M80 18 L81.4 22.6 L86 24 L81.4 25.4 L80 30 L78.6 25.4 L74 24 L78.6 22.6 Z" fill={SeekerColors.spark} />
            <Path d="M34 22 L34.9 24.9 L37.8 25.8 L34.9 26.7 L34 29.6 L33.1 26.7 L30.2 25.8 L33.1 24.9 Z" fill={SeekerColors.spark} opacity={0.8} />
            <Path d="M86 58 L86.8 60.6 L89.4 61.4 L86.8 62.2 L86 64.8 L85.2 62.2 L82.6 61.4 L85.2 60.6 Z" fill={SeekerColors.spark} opacity={0.7} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}
