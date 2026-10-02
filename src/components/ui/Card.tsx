import { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function CardAmount({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.amount, style]}>{children}</Text>;
}

function TriangleUp({ color }: { color: string }) {
  return (
    <Svg width={7} height={7} viewBox="0 0 8 8" fill="none">
      <Path d="M4 0L8 7H0L4 0Z" fill={color} />
    </Svg>
  );
}

function TriangleDown({ color }: { color: string }) {
  return (
    <Svg width={7} height={7} viewBox="0 0 8 8" fill="none">
      <Path d="M4 8L0 1H8L4 8Z" fill={color} />
    </Svg>
  );
}

export function CardDelta({ value }: { value: number }) {
  const positive = value >= 0;
  const color = positive ? Colors.sage : Colors.redAlert;
  return (
    <View
      style={[
        styles.deltaPill,
        { backgroundColor: positive ? 'rgba(143,174,130,0.10)' : 'rgba(224,82,82,0.10)' },
      ]}
    >
      {positive ? <TriangleUp color={color} /> : <TriangleDown color={color} />}
      <Text style={[styles.deltaText, { color }]}>{Math.abs(value).toFixed(1)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg1,
    borderRadius: Radii.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  label: {
    ...Type.label,
    color: Colors.tx2,
  },
  amount: {
    ...Type.amount,
    color: Colors.tx0,
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: Radii.sm,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  deltaText: {
    ...Type.label,
  },
});
