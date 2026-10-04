import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useLiveCoins, usePriceFlash } from '@/hooks/use-live-prices';
import type { SupportedCoin } from '@/hooks/use-crypto-prices';
import { CoinLogo } from './CoinLogo';

const RANGES = [
  { key: '24H', interval: '15m', limit: 96 },
  { key: '7D', interval: '1h', limit: 168 },
  { key: '30D', interval: '4h', limit: 180 },
  { key: '1Y', interval: '1d', limit: 365 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

const KLINE_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
const W = 300;
const H = 120;

export const formatPrice = (n: number) => {
  const decimals = n >= 1 ? 2 : n >= 0.01 ? 4 : n >= 0.0001 ? 6 : 8;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

const formatBig = (n: number | null | undefined) => {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
};

/** Closing prices for a coin from the exchange's public candles; throws if the exchange doesn't list it. */
async function fetchCloses(symbol: string, interval: string, limit: number): Promise<number[]> {
  let lastErr: unknown;
  for (const host of KLINE_HOSTS) {
    try {
      const res = await fetch(`${host}/api/v3/klines?symbol=${encodeURIComponent(symbol)}USDT&interval=${interval}&limit=${limit}`);
      if (!res.ok) throw new Error(`candles ${res.status}`);
      const rows = (await res.json()) as unknown[][];
      return rows.map((r) => Number(r[4])).filter((n) => n > 0);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function CoinChart({ symbol, livePrice }: { symbol: string; livePrice: number }) {
  const [range, setRange] = useState<RangeKey>('7D');
  const cfg = RANGES.find((r) => r.key === range)!;
  const { data, isPending, isError } = useQuery({
    queryKey: ['coin-candles', symbol, range],
    queryFn: () => fetchCloses(symbol, cfg.interval, cfg.limit),
    staleTime: 60_000,
    retry: false,
  });

  // Close the line on the live price so the chart's right edge matches the number above it.
  const points = useMemo(() => (data && data.length > 1 ? [...data.slice(0, -1), livePrice] : []), [data, livePrice]);
  const { line, area, up } = useMemo(() => {
    if (points.length < 2) return { line: '', area: '', up: true };
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const xy = points.map((p, i) => [(i / (points.length - 1)) * W, 108 - ((p - min) / span) * 96] as const);
    const l = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return { line: l, area: `${l} L${W},${H} L0,${H} Z`, up: points[points.length - 1] >= points[0] };
  }, [points]);
  const color = up ? Colors.sage : Colors.redAlert;

  return (
    <View>
      {isError ? (
        <View style={styles.chartEmpty}>
          <Text style={styles.small}>No chart for this coin.</Text>
        </View>
      ) : isPending ? (
        <View style={styles.chartEmpty}>
          <Text style={styles.small}>Loading chart…</Text>
        </View>
      ) : (
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" accessibilityLabel={`${symbol} price chart`}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.25} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill="url(#fill)" />
          <Path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </Svg>
      )}
      <View style={styles.ranges}>
        {RANGES.map((r) => (
          <Pressable key={r.key} onPress={() => setRange(r.key)} style={[styles.range, range === r.key && styles.rangeActive]}>
            <Text style={[styles.rangeText, range === r.key && { color: '#FFFFFF' }]}>{r.key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.small}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const pct = (n: number | null | undefined) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
const pctColor = (n: number | null | undefined) => (n == null ? Colors.tx0 : n >= 0 ? Colors.sage : Colors.redAlert);

/** Detail for one coin: live price, chart, stats, the providers that take it, and a hand-off to the assistant. */
export function CoinSheet({ coin, onClose, onAsk }: { coin: SupportedCoin | null; onClose: () => void; onAsk: (prompt: string) => void }) {
  return (
    <BottomSheet open={coin !== null} onClose={onClose} title={coin?.symbol ?? ''} snapPoints={['85%']} scrollable>
      {coin && (
        <CoinDetail
          coin={coin}
          onAsk={(p) => {
            onClose();
            setTimeout(() => onAsk(p), 300);
          }}
        />
      )}
    </BottomSheet>
  );
}

function CoinDetail({ coin, onAsk }: { coin: SupportedCoin; onAsk: (prompt: string) => void }) {
  // Keep the tapped coin live while the sheet is open.
  const live = useLiveCoins([coin])![0];
  const flash = usePriceFlash(live.priceUsd);
  const priceColor = flash === 'up' ? Colors.sage : flash === 'down' ? Colors.redAlert : Colors.tx0;

  return (
    <View style={styles.stack}>
      <View style={styles.head}>
        <CoinLogo id={coin.id} symbol={coin.symbol} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{coin.name}</Text>
          <Text style={styles.small}>
            {coin.symbol}
            {coin.rank ? ` · Rank #${coin.rank}` : ''}
          </Text>
        </View>
      </View>

      <View>
        <Text style={[styles.price, { color: priceColor }]}>{formatPrice(live.priceUsd)}</Text>
        <Text style={[styles.small, { color: pctColor(live.change24h) }]}>{pct(live.change24h)} past 24h</Text>
      </View>

      <CoinChart symbol={coin.symbol} livePrice={live.priceUsd} />

      <View style={styles.statRow}>
        <Stat label="1h" value={pct(coin.change1h)} color={pctColor(coin.change1h)} />
        <Stat label="7d" value={pct(coin.change7d)} color={pctColor(coin.change7d)} />
        <Stat label="Market cap" value={formatBig(coin.marketCap)} />
      </View>

      {coin.providers.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.small}>Supported in Bluvfi through</Text>
          <View style={styles.providers}>
            {coin.providers.map((p) => (
              <View key={p} style={styles.providerChip}>
                <Text style={styles.providerText}>{p}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Button fullWidth onPress={() => onAsk(`Tell me about ${coin.name} (${coin.symbol}): its price, recent trend, and what I can do with it in Bluvfi.`)}>
        {`Ask Bluvfi about ${coin.symbol}`}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  name: { ...Type.h2, color: Colors.tx0 },
  small: { ...Type.small, color: Colors.tx1 },
  price: { ...Type.display, fontFamily: Fonts.sansBold },
  chartEmpty: { height: H, alignItems: 'center', justifyContent: 'center' },
  ranges: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  range: { borderRadius: 999, backgroundColor: Colors.bg2, paddingVertical: 4, paddingHorizontal: Spacing.md },
  rangeActive: { backgroundColor: Colors.blue },
  rangeText: { ...Type.small, color: Colors.tx1 },
  statRow: { flexDirection: 'row', gap: Spacing.sm },
  stat: { flex: 1, borderRadius: Radii.lg, backgroundColor: 'rgba(242,240,232,0.04)', padding: Spacing.md, gap: 2 },
  statValue: { ...Type.h3, color: Colors.tx0 },
  providers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  providerChip: { borderRadius: 999, backgroundColor: 'rgba(143,174,130,0.12)', paddingVertical: 3, paddingHorizontal: 10 },
  providerText: { ...Type.small, color: Colors.sage },
});
