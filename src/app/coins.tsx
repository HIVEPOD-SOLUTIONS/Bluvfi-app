import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useAllCoins, useCoinLookup, useCryptoPrices, useSupportedCoins, type SupportedCoin } from '@/hooks/use-crypto-prices';

/** $64,231.55 for normal prices; more decimals below $1 so a cheap coin still shows movement. */
function formatPrice(n: number): string {
  const decimals = n >= 1 ? 2 : n >= 0.01 ? 4 : 6;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatCap(n: number | null): string | null {
  if (n === null) return null;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

function Change({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <Text style={[styles.change, { color: up ? Colors.sage : Colors.redAlert }]}>
      {label} {up ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
    </Text>
  );
}

function CoinRow({ coin }: { coin: SupportedCoin }) {
  const cap = formatCap(coin.marketCap);
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{coin.symbol.slice(0, 4)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.symbol}>{coin.symbol}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {coin.name}
            {coin.rank ? ` · #${coin.rank}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.price}>{formatPrice(coin.priceUsd)}</Text>
          <Change label="24h" value={coin.change24h} />
        </View>
      </View>
      <View style={styles.meta}>
        <Change label="1h" value={coin.change1h} />
        <Change label="7d" value={coin.change7d} />
        {cap ? <Text style={styles.name}>Cap {cap}</Text> : null}
      </View>
      {coin.providers.length > 0 ? (
        <View style={styles.providers}>
          {coin.providers.map((p) => (
            <View key={p} style={styles.providerChip}>
              <Text style={styles.providerText}>{p}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Every coin CoinMarketCap lists, one per row in market-cap order, loaded a page at a time as you scroll. */
export default function CoinsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const all = useAllCoins();
  // Older backend without /api/prices/all: fall back to the provider-supported list, then the four-coin feed.
  const supported = useSupportedCoins();
  const basic = useCryptoPrices(all.isError && supported.isError);
  const lookup = useCoinLookup(debounced);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);

  const coins: SupportedCoin[] | null = useMemo(() => {
    if (all.data) return all.data.pages.flatMap((p) => p.coins);
    if (all.isError && supported.data) return supported.data.coins;
    if (all.isError && supported.isError && basic.data)
      return basic.data.prices.map((c) => ({ ...c, rank: null, change7d: null, marketCap: null, providers: [] }));
    return null;
  }, [all.data, all.isError, supported.data, supported.isError, basic.data]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const base = (coins ?? []).filter(
      (c) => !q || c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.providers.some((p) => p.toLowerCase().includes(q)),
    );
    // A ticker typed in full that isn't in the pages loaded yet (e.g. rank 3,000): add the direct lookup.
    const extra = (q && lookup.data?.coins) || [];
    const have = new Set(base.map((c) => String(c.id ?? c.symbol)));
    return [...base, ...extra.filter((c) => !have.has(String(c.id ?? c.symbol)))];
  }, [coins, q, lookup.data]);

  const loading = all.isPending || (all.isError && supported.isPending) || (all.isError && supported.isError && basic.isPending);
  const stale = all.isError ? (supported.data?.stale ?? basic.data?.stale ?? false) : false;
  const paged = !!all.data;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + Spacing.sm }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
            <Path d="M10 3L5 8l5 5" stroke={Colors.tx0} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Coin prices</Text>
          <Text style={styles.name}>{paged ? 'Every coin on CoinMarketCap, by market cap' : 'Coins supported across providers'}</Text>
        </View>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search coin name or ticker"
        placeholderTextColor={Colors.tx2}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.search}
      />

      {loading ? (
        <ActivityIndicator color={Colors.sage} style={{ marginTop: Spacing.xxxl }} />
      ) : !coins ? (
        <Text style={styles.empty}>Prices aren't available right now. Try again in a moment.</Text>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => String(c.id ?? c.symbol)}
          renderItem={({ item }) => <CoinRow coin={item} />}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          ListEmptyComponent={
            lookup.isFetching ? (
              <ActivityIndicator color={Colors.sage} style={{ marginTop: Spacing.xxxl }} />
            ) : (
              <Text style={styles.empty}>No coins match “{query}”.</Text>
            )
          }
          onEndReached={() => {
            if (paged && !q && all.hasNextPage && !all.isFetchingNextPage) all.fetchNextPage();
          }}
          onEndReachedThreshold={0.6}
          ListFooterComponent={
            all.isFetchingNextPage ? (
              <ActivityIndicator color={Colors.sage} style={{ marginVertical: Spacing.lg }} />
            ) : (
              <View style={styles.footer}>
                <View style={[styles.dot, { backgroundColor: stale ? Colors.amber : Colors.sage }]} />
                <Text style={styles.name}>{stale ? 'Delayed' : 'Live'} · via CoinMarketCap</Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={9}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg0, paddingHorizontal: Spacing.lg, gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  title: { ...Type.h1, color: Colors.tx0 },
  name: { ...Type.small, color: Colors.tx1 },
  search: {
    ...Type.body,
    color: Colors.tx0,
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
  },
  row: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  badge: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bg2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: Fonts.monoBold, fontSize: 11, color: Colors.tx0 },
  symbol: { ...Type.h3, color: Colors.tx0 },
  price: { ...Type.h3, fontFamily: Fonts.sansBold, color: Colors.tx0 },
  change: { ...Type.small, fontSize: 11 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  providers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  providerChip: { borderRadius: 999, backgroundColor: 'rgba(143,174,130,0.12)', paddingVertical: 2, paddingHorizontal: 8 },
  providerText: { ...Type.small, fontSize: 11, color: Colors.sage },
  empty: { ...Type.body, color: Colors.tx1, textAlign: 'center', paddingVertical: Spacing.xxxl },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.lg },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
