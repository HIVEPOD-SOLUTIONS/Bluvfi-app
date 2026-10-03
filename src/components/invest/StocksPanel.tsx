import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { isEtf, useStocksList, useStocksPortfolio, type StockRow } from '@/hooks/use-stocks';
import { StockLogo } from './StockLogo';

const usd = (n: number, dp = 2) => `$${n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const pct = (n: number | null) => (n === null ? '' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
const changeColor = (n: number | null) => ((n ?? 0) >= 0 ? Colors.sage : Colors.redAlert);

interface StocksPanelProps {
  kind: 'stock' | 'etf';
  onSelectStock: (stock: StockRow) => void;
  onWithdraw: () => void;
}

/** US stocks or ETFs through Backpack: market status, leftover credit, search and the list. */
export function StocksPanel({ kind, onSelectStock, onWithdraw }: StocksPanelProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const { data: portfolio } = useStocksPortfolio();
  const { data, isLoading, isError, error } = useStocksList(debounced);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), query ? 300 : 0);
    return () => clearTimeout(id);
  }, [query]);

  const visible = useMemo(
    () => (data?.stocks ?? []).filter((r) => (kind === 'etf' ? isEtf(r.name) : !isEtf(r.name))).slice(0, 60),
    [data, kind],
  );
  const session = data?.session;
  const enabled = portfolio?.tradingEnabled ?? true;

  return (
    <View style={styles.stack}>
      <View style={styles.statusRow}>
        <View style={[styles.badge, session && styles.badgeLive]}>
          <Text style={[styles.badgeText, session && { color: Colors.sage }]}>
            {session ? `● ${session.name.replace('US_EQUITIES_', '').replace('_', '-').toLowerCase()}` : 'Market closed'}
          </Text>
        </View>
        {!enabled ? (
          <Text style={styles.sub}>Prices are live. Trading is coming soon.</Text>
        ) : portfolio && portfolio.cashUsd >= 0.01 ? (
          // Leftover credit (unused buy reserve, or sale money under $1) — used first on the next buy.
          <Text style={[styles.sub, { flex: 1 }]}>
            {usd(portfolio.cashUsd)} credit, used first on your next buy
            {portfolio.cashUsd >= 1 ? (
              <Text onPress={onWithdraw} style={styles.link}>
                {'  ·  send to wallet'}
              </Text>
            ) : null}
          </Text>
        ) : (
          <Text style={styles.sub}>Pay with USDC from your wallet</Text>
        )}
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={kind === 'etf' ? 'Search ETFs (SPY, QQQ…)' : 'Search stocks (AAPL, Tesla…)'}
        placeholderTextColor={Colors.tx2}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.search}
      />

      {isLoading && visible.length === 0 ? (
        <ActivityIndicator color={Colors.sage} style={{ marginVertical: Spacing.xxxl }} />
      ) : isError ? (
        <Text style={styles.message}>{(error as Error)?.message || "Couldn't load stocks."}</Text>
      ) : visible.length === 0 ? (
        <Text style={styles.message}>{`No ${kind === 'etf' ? 'ETFs' : 'stocks'} match “${query}”.`}</Text>
      ) : (
        visible.map((r) => (
          <Pressable key={r.asset} onPress={() => onSelectStock(r)} style={styles.row}>
            <StockLogo ticker={r.ticker} />
            <View style={{ flex: 1 }}>
              <Text style={styles.ticker}>{r.ticker}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {r.name}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.price}>{r.price !== null ? usd(r.price) : '—'}</Text>
              <Text style={[styles.small, { color: changeColor(r.changePct) }]}>{pct(r.changePct)}</Text>
            </View>
          </Pressable>
        ))
      )}

      <Text style={styles.disclaimer}>
        Prices from Backpack Exchange. Trades execute on Backpack; holdings are recorded by Bluvfi. Investing involves risk.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sub: { ...Type.small, color: Colors.tx1 },
  small: { ...Type.small },
  link: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline' },
  badge: { borderRadius: 999, backgroundColor: Colors.bg2, paddingVertical: 4, paddingHorizontal: Spacing.md },
  badgeLive: { backgroundColor: 'rgba(143,174,130,0.15)' },
  badgeText: { ...Type.small, color: Colors.tx1 },
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
  message: { ...Type.body, color: Colors.tx1, textAlign: 'center', paddingVertical: Spacing.xxxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  ticker: { ...Type.h3, color: Colors.tx0 },
  price: { ...Type.body, fontFamily: Type.h3.fontFamily, color: Colors.tx0 },
  disclaimer: { ...Type.small, fontSize: 11, color: Colors.tx2, textAlign: 'center', paddingHorizontal: Spacing.sm },
});
