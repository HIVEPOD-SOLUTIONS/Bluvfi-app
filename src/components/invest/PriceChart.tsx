import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useApiQuery } from '@/hooks/use-api';

const RANGES = ['1w', '1m', '1y'] as const;
type Range = (typeof RANGES)[number];

const W = 300;
const H = 100;

/** A stock's price line for 1 week / 1 month / 1 year, from `/api/stocks/chart`. */
export function PriceChart({ asset }: { asset: string }) {
  const [range, setRange] = useState<Range>('1m');
  const { data } = useApiQuery<{ points: { close: number }[] }>(['stocks-chart', asset, range], '/api/stocks/chart', { asset, range }, { staleTime: 60_000 });

  const points = useMemo(() => (data?.points ?? []).map((p) => p.close).filter((n) => n > 0), [data]);
  const path = useMemo(() => {
    if (points.length < 2) return '';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    return points.map((p, i) => `${i ? 'L' : 'M'}${(i / (points.length - 1)) * W},${90 - ((p - min) / span) * 80}`).join(' ');
  }, [points]);
  const up = points.length > 1 && points[points.length - 1] >= points[0];

  return (
    <View>
      <Svg width="100%" height={112} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" accessibilityLabel={`${asset} price chart`}>
        {path ? <Path d={path} fill="none" stroke={up ? Colors.sage : Colors.redAlert} strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
      </Svg>
      <View style={styles.ranges}>
        {RANGES.map((r) => (
          <Pressable key={r} onPress={() => setRange(r)} style={[styles.range, range === r && styles.rangeActive]}>
            <Text style={[styles.rangeText, range === r && styles.rangeTextActive]}>{r.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ranges: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  range: { borderRadius: 999, backgroundColor: Colors.bg2, paddingVertical: 4, paddingHorizontal: Spacing.md },
  rangeActive: { backgroundColor: Colors.blue },
  rangeText: { ...Type.small, color: Colors.tx1 },
  rangeTextActive: { color: '#FFFFFF' },
});
