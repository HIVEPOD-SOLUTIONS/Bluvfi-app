import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { SharColors } from '@/constants/shar';

/**
 * A short burst of light from the middle of the Shar orb: a ring that opens out and a ring of sparks that fly outward and fade.
 * Put it over (or behind) a SharOrb of the same `size` and change `trigger` to fire it. With the system's reduce-motion setting on,
 * nothing moves (the sound and the words carry the moment).
 */
const SPARKS = 14;

export function SharBurst({ trigger, size = 180, color = SharColors.glow }: { trigger: number; size?: number; color?: string }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(1);

  useEffect(() => {
    if (!trigger || reduced) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) });
  }, [trigger, reduced, progress]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - progress.value),
    transform: [{ scale: 0.25 + 1.15 * progress.value }],
  }));

  return (
    <View style={{ width: size, height: size }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.ring, { width: size * 0.7, height: size * 0.7, borderRadius: size * 0.35, left: size * 0.15, top: size * 0.15, borderColor: color }, ringStyle]} />
      {Array.from({ length: SPARKS }, (_, i) => (
        <Spark key={i} index={i} size={size} color={color} progress={progress} />
      ))}
    </View>
  );
}

function Spark({ index, size, color, progress }: { index: number; size: number; color: string; progress: SharedValue<number> }) {
  const angle = (index / SPARKS) * Math.PI * 2 + (index % 2 ? 0.2 : 0);
  const reach = size * (index % 2 ? 0.5 : 0.38);
  const dot = index % 3 === 0 ? 7 : 5;
  const style = useAnimatedStyle(() => ({
    opacity: progress.value >= 1 ? 0 : 1 - progress.value * progress.value,
    transform: [{ translateX: Math.cos(angle) * reach * progress.value }, { translateY: Math.sin(angle) * reach * progress.value }, { scale: 1 - 0.6 * progress.value }],
  }));
  return <Animated.View style={[styles.spark, { width: dot, height: dot, borderRadius: dot / 2, left: size / 2 - dot / 2, top: size / 2 - dot / 2, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 2 },
  spark: { position: 'absolute' },
});
