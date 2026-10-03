import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import type { StockRow } from '@/hooks/use-stocks';
import type { ProviderId } from './InvestScreen';
import { StocksPanel } from './StocksPanel';

/** Backpack sheet: the web's header (logo, "US Stocks & ETFs") with a Stocks / ETFs switch over the market list. */
export function BackpackSheet({
  kind,
  onChangeKind,
  onClose,
  onSelectStock,
  onWithdraw,
}: {
  /** null = closed */
  kind: 'stock' | 'etf' | null;
  onChangeKind: (k: 'stock' | 'etf') => void;
  onClose: () => void;
  onSelectStock: (stock: StockRow) => void;
  onWithdraw: () => void;
}) {
  return (
    <BottomSheet open={kind !== null} onClose={onClose} title="Backpack" snapPoints={['92%']} scrollable>
      <View style={styles.headerRow}>
        <Image source={require('../../../assets/images/logos/backpack.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.sub}>US Stocks & ETFs</Text>
      </View>
      <View style={styles.toggle}>
        {(['stock', 'etf'] as const).map((k) => (
          <Pressable key={k} onPress={() => onChangeKind(k)} style={[styles.toggleButton, kind === k && styles.toggleActive]}>
            <Text style={[styles.toggleText, kind === k && styles.toggleTextActive]}>{k === 'stock' ? 'Stocks' : 'ETFs'}</Text>
          </Pressable>
        ))}
      </View>
      {kind && <StocksPanel key={kind} kind={kind} onSelectStock={onSelectStock} onWithdraw={onWithdraw} />}
    </BottomSheet>
  );
}

const PROVIDERS: Record<ProviderId, { name: string; tag: string; blurb: string; prompt: string }> = {
  getequity: {
    name: 'GetEquity',
    tag: 'Private Markets · Managed model',
    blurb:
      'Early-stage equity, SAFE and debt raises, invested through a real, KYC-approved GetEquity account. The Bluvfi assistant can set up your member profile, show what you can invest in and take your payment.',
    prompt: 'I want to invest in private markets with GetEquity. Show me what is available.',
  },
  nosana: {
    name: 'Nosana GPU Cloud',
    tag: 'AI Compute',
    blurb:
      'Deploy containerized AI workloads on decentralized GPUs and pay with NOS credits. The Bluvfi assistant can show GPU markets and your credits.',
    prompt: 'Tell me about Nosana GPU Cloud and show me the available GPU markets.',
  },
  doma: {
    name: 'Doma Protocol',
    tag: 'DomainFi',
    blurb:
      'Search, analyze and trade tokenized internet domains. The Bluvfi assistant can search names, price them, register or renew them, and buy marketplace listings, and you pay from your wallet in chat.',
    prompt: 'I want to look for a domain on Doma. Help me search and check the price.',
  },
};

/** GetEquity / Nosana / Doma: these run through the AI assistant in the app, so the sheet explains that and hands off to chat. */
export function ProviderSheet({
  provider,
  onClose,
  onAsk,
}: {
  provider: ProviderId | null;
  onClose: () => void;
  onAsk: (prompt: string) => void;
}) {
  const p = provider ? PROVIDERS[provider] : null;
  return (
    <BottomSheet open={!!p} onClose={onClose} title={p?.name ?? ''} snapPoints={['55%']} scrollable>
      {p && (
        <View style={{ gap: Spacing.lg }}>
          <Text style={styles.sub}>{p.tag}</Text>
          <Text style={styles.body}>{p.blurb}</Text>
          <Button
            fullWidth
            onPress={() => {
              onClose();
              // Let this sheet finish closing before the chat opens.
              setTimeout(() => onAsk(p.prompt), 300);
            }}
          >
            {`Ask Bluvfi about ${p.name}`}
          </Button>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  logo: { width: 22, height: 22, borderRadius: Radii.sm },
  sub: { ...Type.small, color: Colors.tx1 },
  body: { ...Type.body, color: Colors.tx0 },
  toggle: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  toggleButton: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: 999, backgroundColor: Colors.bg2 },
  toggleActive: { backgroundColor: Colors.blue },
  toggleText: { ...Type.body, color: Colors.tx1 },
  toggleTextActive: { color: '#FFFFFF' },
});
