import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Radii, Type } from '@/constants/theme';

export type BadgeVariant = 'live' | 'pending' | 'failed' | 'premium';

const CONFIG: Record<BadgeVariant, { label: string; color: string; bg: string }> = {
  live: { label: 'Live', color: Colors.sage, bg: 'rgba(143,174,130,0.10)' },
  pending: { label: 'Pending', color: Colors.amber, bg: 'rgba(232,168,56,0.10)' },
  failed: { label: 'Failed', color: Colors.redAlert, bg: 'rgba(224,82,82,0.10)' },
  premium: { label: 'Premium', color: Colors.gold, bg: 'rgba(201,168,76,0.10)' },
};

function StarIcon({ color }: { color: string }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 16 16" fill="none">
      <Path d="M8 1l1.8 4.8L15 7l-5.2 1.2L8 13l-1.8-4.8L1 7l5.2-1.2L8 1z" fill={color} />
    </Svg>
  );
}

export function Badge({ variant, children }: { variant: BadgeVariant; children?: string }) {
  const { label, color, bg } = CONFIG[variant];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {variant === 'premium' ? <StarIcon color={color} /> : <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={[styles.text, { color }]}>{children ?? label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: Radii.sm,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    ...Type.label,
  },
});
