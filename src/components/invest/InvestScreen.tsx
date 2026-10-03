import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useStocksPortfolio, type StockPosition, type StockRow } from '@/hooks/use-stocks';
import { StockLogo } from './StockLogo';

/**
 * The Invest tab, laid out like the web's: a Portfolio Value card with "Ask AI for advice", a My Portfolio /
 * Market toggle, then (under Market) filter chips and the provider cards — Backpack (US stocks and ETFs),
 * GetEquity (private markets), Nosana and Doma. Tapping a provider opens its sheet, owned by Home.
 */

export type ProviderId = 'getequity' | 'nosana' | 'doma';

const MARKET_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'stock', label: 'Stocks' },
  { key: 'ipo', label: 'Pre-IPO' },
  { key: 'etf', label: 'ETFs' },
  { key: 'crypto', label: 'Crypto Trading' },
] as const;
type MarketFilter = (typeof MARKET_FILTERS)[number]['key'];

const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

interface InvestScreenProps {
  onAskAi: (prompt: string) => void;
  onOpenBackpack: (kind: 'stock' | 'etf') => void;
  onOpenProvider: (id: ProviderId) => void;
  onSelectStock: (stock: StockRow) => void;
}

export function InvestScreen({ onAskAi, onOpenBackpack, onOpenProvider, onSelectStock }: InvestScreenProps) {
  const [view, setView] = useState<'portfolio' | 'market'>('portfolio');
  const [filter, setFilter] = useState<MarketFilter>('all');
  const { data: portfolio, isLoading } = useStocksPortfolio();

  const positions = [...(portfolio?.positions ?? [])].sort((a, b) => b.valueUsd - a.valueUsd);
  const count = positions.length;

  return (
    <View style={styles.stack}>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Portfolio Value</Text>
        <Text style={styles.summaryTotal}>{usd(portfolio?.totalUsd ?? 0)}</Text>
        <Text style={styles.sub}>
          {count} position{count !== 1 ? 's' : ''}
        </Text>
        <View style={{ marginTop: Spacing.lg }}>
          <Button onPress={() => onAskAi('What should I invest in? Show me my portfolio.')}>Ask AI for advice</Button>
        </View>
      </View>

      <View style={styles.toggle}>
        {(['portfolio', 'market'] as const).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} style={[styles.toggleButton, view === v && styles.toggleActive]}>
            <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>{v === 'portfolio' ? 'My Portfolio' : 'Market'}</Text>
          </Pressable>
        ))}
      </View>

      {view === 'portfolio' &&
        (isLoading ? (
          <Text style={styles.message}>Loading your portfolio…</Text>
        ) : count === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 36 }}>📊</Text>
            <Text style={styles.emptyTitle}>No positions yet</Text>
            <Text style={styles.sub}>Browse the market to start investing</Text>
            <View style={{ height: Spacing.md }} />
            <Button onPress={() => setView('market')}>Browse Market</Button>
          </View>
        ) : (
          <View style={styles.stack}>
            {positions.map((p) => (
              <PositionCard key={p.asset} position={p} onPress={() => onSelectStock({ asset: p.asset, ticker: p.ticker, name: p.name, price: p.price, changePct: p.changePct, tradableNow: true })} />
            ))}
          </View>
        ))}

      {view === 'market' && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {MARKET_FILTERS.map((f) => (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, filter === f.key && styles.chipActive]}>
                <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {(filter === 'all' || filter === 'stock' || filter === 'etf') && (
            <ProviderCard
              onPress={() => onOpenBackpack(filter === 'etf' ? 'etf' : 'stock')}
              icon={<Image source={require('../../../assets/images/logos/backpack.png')} style={styles.backpackLogo} resizeMode="contain" />}
              iconBg="rgba(227,62,63,0.1)"
              name="Backpack"
              tag="US Stocks & ETFs"
              badge="USDC"
              badgeColor={Colors.sage}
              badgeBg="rgba(143,174,130,0.12)"
              description="1,100+ stocks and ETFs — AAPL, NVDA, TSLA, SPY — fractional shares, trades nearly 24/5"
            />
          )}

          {(filter === 'ipo' || filter === 'all') && (
            <ProviderCard
              onPress={() => onOpenProvider('getequity')}
              icon={<Text style={styles.geIcon}>GE</Text>}
              iconBg="rgba(129,140,248,0.1)"
              name="GetEquity"
              tag="Private Markets"
              badge="Managed"
              badgeColor="#818CF8"
              badgeBg="rgba(129,140,248,0.1)"
              description="Early-stage equity, SAFE and debt raises — invest via a real, KYC-approved GetEquity account"
            />
          )}

          {(filter === 'crypto' || filter === 'all') && (
            <>
              <ProviderCard
                onPress={() => onOpenProvider('nosana')}
                icon={<Text style={{ fontSize: 22 }}>⚙️</Text>}
                iconBg="rgba(242,240,232,0.06)"
                name="Nosana GPU Cloud"
                tag="AI Compute"
                badge="Solana"
                badgeColor="#A78BFA"
                badgeBg="rgba(167,139,250,0.1)"
                description="Deploy containerized AI workloads on decentralized GPUs — pay with NOS credits"
              />
              <ProviderCard
                onPress={() => onOpenProvider('doma')}
                icon={<Text style={{ fontSize: 22 }}>⌁</Text>}
                iconBg="rgba(242,240,232,0.06)"
                name="Doma Protocol"
                tag="DomainFi"
                badge="Doma"
                badgeColor="#22D3EE"
                badgeBg="rgba(34,211,238,0.1)"
                description="Search, analyze, and prepare trades for tokenized internet domains"
              />
            </>
          )}
        </>
      )}
    </View>
  );
}

function PositionCard({ position: p, onPress }: { position: StockPosition; onPress: () => void }) {
  const up = p.changePct >= 0;
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.cardTop}>
        <StockLogo ticker={p.ticker} />
        <View style={{ flex: 1 }}>
          <Text style={styles.ticker}>{p.ticker}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {p.name}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.ticker}>{usd(p.valueUsd)}</Text>
          <Text style={[styles.sub, { color: up ? Colors.sage : Colors.redAlert }]}>{pct(p.changePct)} today</Text>
        </View>
      </View>
      <View style={styles.cardStats}>
        <Text style={styles.sub}>{Number(p.quantity).toFixed(4)} shares</Text>
        <Text style={styles.sub}>now {usd(p.price)}</Text>
      </View>
    </Pressable>
  );
}

function ProviderCard(props: {
  onPress: () => void;
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  tag: string;
  badge: string;
  badgeColor: string;
  badgeBg: string;
  description: string;
}) {
  return (
    <Pressable onPress={props.onPress} style={styles.provider}>
      <View style={[styles.providerIcon, { backgroundColor: props.iconBg }]}>{props.icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.providerTitleRow}>
          <Text style={styles.providerName}>{props.name}</Text>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{props.tag}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: props.badgeBg }]}>
            <Text style={[styles.tagText, { color: props.badgeColor }]}>{props.badge}</Text>
          </View>
        </View>
        <Text style={styles.sub} numberOfLines={2}>
          {props.description}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.md },
  summary: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.borderSage,
    borderRadius: Radii.xxl,
    padding: Spacing.xl,
  },
  summaryLabel: { ...Type.label, fontSize: 12, color: Colors.tx1 },
  summaryTotal: { ...Type.amount, fontSize: 32, lineHeight: 40, color: Colors.tx0, marginTop: 2 },
  sub: { ...Type.small, color: Colors.tx1 },
  toggle: { flexDirection: 'row', gap: Spacing.sm },
  toggleButton: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: 999, backgroundColor: Colors.bg2 },
  toggleActive: { backgroundColor: Colors.blue },
  toggleText: { ...Type.body, color: Colors.tx1 },
  toggleTextActive: { color: '#FFFFFF' },
  message: { ...Type.body, color: Colors.tx1, textAlign: 'center', paddingVertical: Spacing.xxxl },
  empty: { alignItems: 'center', paddingVertical: Spacing.xxxl, gap: 4 },
  emptyTitle: { ...Type.h3, color: Colors.tx0, marginTop: Spacing.sm },
  chips: { gap: Spacing.sm },
  chip: { borderRadius: 999, backgroundColor: Colors.bg2, paddingVertical: 8, paddingHorizontal: Spacing.lg },
  chipActive: { backgroundColor: Colors.blue },
  chipText: { ...Type.body, color: Colors.tx1 },
  chipTextActive: { color: '#FFFFFF' },
  card: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cardStats: { flexDirection: 'row', gap: Spacing.lg },
  ticker: { ...Type.h3, color: Colors.tx0 },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  providerIcon: { width: 48, height: 48, borderRadius: Radii.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  backpackLogo: { width: 32, height: 32 },
  geIcon: { fontFamily: Fonts.sansBold, fontSize: 14, color: '#818CF8' },
  providerTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  providerName: { ...Type.h3, color: Colors.tx0 },
  tag: { borderRadius: 999, backgroundColor: 'rgba(242,240,232,0.06)', paddingVertical: 2, paddingHorizontal: 8 },
  tagText: { ...Type.small, fontSize: 11, color: Colors.tx1 },
  chevron: { ...Type.h1, color: Colors.tx1 },
});
