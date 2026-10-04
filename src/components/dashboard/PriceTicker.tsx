import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { CoinLogo } from '@/components/crypto/CoinLogo';
import { useLiveConnected, useLiveCoins, usePriceFlash } from '@/hooks/use-live-prices';
import { useAllCoins, useCryptoPrices, useSupportedCoins, type CoinPrice, type SupportedCoin } from '@/hooks/use-crypto-prices';

/** How many of the top coins the home strip shows; the Crypto tab lists them all. */
const TICKER_COINS = 50;

/** $64,231.55 for normal prices; more decimals below $1 so a coin like XRP still shows movement. */
function formatCoinPrice(n: number): string {
  const decimals = n >= 1 ? 2 : n >= 0.01 ? 4 : 6;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** Legacy four-coin feed has no ids; these are CoinMarketCap's, so the logos still show. */
const LEGACY_IDS: Record<string, number> = { BTC: 1, ETH: 1027, SOL: 5426, XRP: 52 };

/** The full row for a tapped chip (market cap, 7d, providers…), else what the chip itself knows. */
function toDetail(chip: CoinPrice, rows?: SupportedCoin[]): SupportedCoin {
  const full = rows?.find((r) => r.symbol === chip.symbol);
  // Keep the chip's price: it may be newer than the row's, thanks to the real-time stream.
  if (full) return { ...full, priceUsd: chip.priceUsd, change24h: chip.change24h };
  return { id: chip.id, symbol: chip.symbol, name: chip.name, rank: null, priceUsd: chip.priceUsd, change1h: chip.change1h, change24h: chip.change24h, change7d: null, marketCap: null, providers: [] };
}

function PriceChip({ coin, onPress }: { coin: CoinPrice; onPress: () => void }) {
  // Brief green/red flash when the price ticks, so movement is noticeable without watching the numbers.
  const flash = usePriceFlash(coin.priceUsd);
  const change = coin.change24h;
  const up = change !== null && change >= 0;
  const priceColor = flash === 'up' ? Colors.sage : flash === 'down' ? Colors.redAlert : Colors.tx0;

  return (
    <Pressable onPress={onPress} style={styles.chip} accessibilityRole="button" accessibilityLabel={`${coin.name} details`}>
      <View style={styles.chipTop}>
        <CoinLogo id={coin.id ?? LEGACY_IDS[coin.symbol]} symbol={coin.symbol} size={20} />
        <Text style={styles.symbol}>{coin.symbol}</Text>
        {change !== null && (
          <Text style={[styles.change, { color: up ? Colors.sage : Colors.redAlert, marginLeft: 'auto' }]}>
            {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
          </Text>
        )}
      </View>
      <Text style={[styles.price, { color: priceColor }]}>{formatCoinPrice(coin.priceUsd)}</Text>
    </Pressable>
  );
}

/**
 * Live crypto price strip for the dashboard: the top coins on the market by market cap, with an "All" button on the right that opens the full vertical list.
 * Renders nothing when no feed is configured or has ever loaded — a missing ticker beats an error banner on the
 * home screen for something purely informational.
 */
export function PriceTicker({ onSelectCoin }: { onSelectCoin: (coin: SupportedCoin) => void }) {
  const router = useRouter();
  // The market itself: top coins by market cap, refreshed every 30s. Older backends without /api/prices/all fall
  // back to the provider-supported list, then to the four-coin feed.
  const market = useAllCoins();
  const supported = useSupportedCoins(market.isError);
  const basic = useCryptoPrices(market.isError && supported.isError);

  const toChip = (c: { id?: number | string; symbol: string; name: string; priceUsd: number; change1h: number | null; change24h: number | null }): CoinPrice => ({
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    priceUsd: c.priceUsd,
    change1h: c.change1h,
    change24h: c.change24h,
    lastUpdated: null,
  });
  const marketCoins = market.data?.pages[0]?.coins;
  const baseCoins: CoinPrice[] | null = marketCoins
    ? marketCoins.slice(0, TICKER_COINS).map(toChip)
    : supported.data
      ? supported.data.coins.map(toChip)
      : basic.data?.prices ?? null;
  // Real-time prices from the exchange stream, laid over the CoinMarketCap rows.
  const coins = useLiveCoins(baseCoins);
  const liveConnected = useLiveConnected();
  const stale = marketCoins ? false : supported.data ? supported.data.stale : basic.data?.stale ?? false;
  const updatedAt = market.data?.pages[0]?.fetchedAt;
  const pending = market.isPending || (market.isError && supported.isPending) || (market.isError && supported.isError && basic.isPending);

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
            <PriceChip key={coin.symbol} coin={coin} onPress={() => onSelectCoin(toDetail(coin, marketCoins ?? supported.data?.coins))} />
          ))}
        </ScrollView>
        <Pressable onPress={() => router.navigate('/crypto' as Href)} accessibilityRole="button" accessibilityLabel="See all coin prices" style={styles.allButton}>
          <Text style={styles.allText}>All</Text>
          <Text style={styles.allChevron}>›</Text>
        </Pressable>
      </View>
      <View style={styles.footer}>
        <View style={[styles.dot, { backgroundColor: stale ? Colors.amber : Colors.sage }]} />
        <Text style={styles.footerText}>{stale ? 'Delayed' : liveConnected ? 'Live · real-time' : 'Live'}{updatedAt ? ` · updated ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</Text>
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
    minWidth: 132,
  },
  chipTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  symbol: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.tx1 },
  change: { ...Type.small, fontSize: 11 },
  price: { ...Type.h3, fontFamily: Fonts.sansBold, marginTop: 2 },
  skeletonRow: { flexDirection: 'row', gap: Spacing.sm },
  skeleton: { width: 118, height: 58, borderRadius: Radii.xl, backgroundColor: 'rgba(242,240,232,0.04)' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  footerText: { ...Type.small, fontSize: 11, color: Colors.tx1 },
});
