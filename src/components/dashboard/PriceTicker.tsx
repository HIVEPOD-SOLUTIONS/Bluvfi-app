import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useCryptoPrices, useSupportedCoins, type CoinPrice } from '@/hooks/use-crypto-prices';

/** $64,231.55 for normal prices; more decimals below $1 so a coin like XRP still shows movement. */
function formatCoinPrice(n: number): string {
  const decimals = n >= 1 ? 2 : n >= 0.01 ? 4 : 6;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function PriceChip({ coin }: { coin: CoinPrice }) {
  // Brief green/red flash when the price ticks, so movement is noticeable without watching the numbers.
  const prev = useRef(coin.priceUsd);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (coin.priceUsd === prev.current) return;
    setFlash(coin.priceUsd > prev.current ? 'up' : 'down');
    prev.current = coin.priceUsd;
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [coin.priceUsd]);

  const change = coin.change24h;
  const up = change !== null && change >= 0;
  const priceColor = flash === 'up' ? Colors.sage : flash === 'down' ? Colors.redAlert : Colors.tx0;

  return (
    <View style={styles.chip}>
      <View style={styles.chipTop}>
        <Text style={styles.symbol}>{coin.symbol}</Text>
        {change !== null && (
          <Text style={[styles.change, { color: up ? Colors.sage : Colors.redAlert }]}>
            {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
          </Text>
        )}
      </View>
      <Text style={[styles.price, { color: priceColor }]}>{formatCoinPrice(coin.priceUsd)}</Text>
    </View>
  );
}

/**
 * Live crypto price strip for the dashboard: every token the providers support (falls back to the four-coin feed
 * on a backend without /api/prices/supported), with an "All" button on the right that opens the full vertical list.
 * Renders nothing when no feed is configured or has ever loaded — a missing ticker beats an error banner on the
 * home screen for something purely informational.
 */
export function PriceTicker() {
  const router = useRouter();
  const all = useSupportedCoins();
  const basic = useCryptoPrices(all.isError);

  const coins: CoinPrice[] | null = all.data
    ? all.data.coins.map((c) => ({ symbol: c.symbol, name: c.name, priceUsd: c.priceUsd, change1h: c.change1h, change24h: c.change24h, lastUpdated: null }))
    : basic.data?.prices ?? null;
  const stale = all.data ? all.data.stale : basic.data?.stale ?? false;
  const pending = all.isPending || (all.isError && basic.isPending);

  if (!coins && !pending) return null;

  if (!coins) {
    return (
      <View style={styles.skeletonRow}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.skeleton} />
        ))}
      </View>
    );
  }
  if (coins.length === 0) return null;

  return (
    <View>
      <View style={styles.rowWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={{ flex: 1 }}>
          {coins.map((coin) => (
            <PriceChip key={coin.symbol} coin={coin} />
          ))}
        </ScrollView>
        <Pressable onPress={() => router.push('/coins' as Href)} accessibilityRole="button" accessibilityLabel="See all coin prices" style={styles.allButton}>
          <Text style={styles.allText}>All</Text>
          <Text style={styles.allChevron}>›</Text>
        </Pressable>
      </View>
      <View style={styles.footer}>
        <View style={[styles.dot, { backgroundColor: stale ? Colors.amber : Colors.sage }]} />
        <Text style={styles.footerText}>{stale ? 'Delayed' : 'Live'} · via CoinMarketCap</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowWrap: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.sm },
  allButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg1,
    paddingHorizontal: Spacing.md,
    marginBottom: 4,
  },
  allText: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  allChevron: { ...Type.h2, color: Colors.sage, lineHeight: 20 },
  row: { gap: Spacing.sm, paddingBottom: 4 },
  chip: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minWidth: 118,
  },
  chipTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  symbol: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.tx1 },
  change: { ...Type.small, fontSize: 11 },
  price: { ...Type.h3, fontFamily: Fonts.sansBold, marginTop: 2 },
  skeletonRow: { flexDirection: 'row', gap: Spacing.sm },
  skeleton: { width: 118, height: 58, borderRadius: Radii.xl, backgroundColor: 'rgba(242,240,232,0.04)' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  footerText: { ...Type.small, fontSize: 11, color: Colors.tx1 },
});
