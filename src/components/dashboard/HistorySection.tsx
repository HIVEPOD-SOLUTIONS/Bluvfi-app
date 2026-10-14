import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { normalizeStatus, useHistory, useWeeklyInsight } from '@/hooks/use-history';
import type { Payment } from '@/lib/api-types';
import { chainLogoByName } from '@/lib/payment-logos';
import { RoundLogo } from './PaymentMethodPicker';

/**
 * History, matching the web: a Total Transacted card, the AI weekly insight, and every payment with its live
 * status. Pending rows update on their own (see useHistory); tapping a row asks the assistant about it.
 */

const TYPE_META: Record<string, { icon: string; label: string; network?: string }> = {
  bill: { icon: '🧾', label: 'Bill / Gift Card' },
  investment: { icon: '📈', label: 'Investment' },
  domain: { icon: '🌐', label: 'Domain' },
  transfer: { icon: '↗️', label: 'Transfer' },
  bridge: { icon: '🌉', label: 'Bridge' },
  nanopay: { icon: '⚡', label: 'Circle Nanopay', network: 'Base' },
  solpay: { icon: '⚡', label: 'Solana Nanopay', network: 'Solana' },
  x402: { icon: '🔑', label: 'x402 Payment' },
  deposit: { icon: '⬇️', label: 'Gateway Deposit' },
  withdrawal: { icon: '⬆️', label: 'Gateway Withdrawal' },
  onramp: { icon: '🏦', label: 'Onramp (INR→Crypto)' },
  offramp: { icon: '💸', label: 'Offramp (Crypto→INR)' },
};

const STATUS: Record<ReturnType<typeof normalizeStatus>, { label: string; color: string }> = {
  completed: { label: 'Completed', color: Colors.sage },
  pending: { label: 'Pending', color: Colors.amber },
  processing: { label: 'Processing', color: '#7DD3FC' },
  failed: { label: 'Failed', color: Colors.redAlert },
};

const CATEGORY_LABELS: Record<string, string> = {
  bill: 'digital products',
  investment: 'investments',
  domain: 'domains',
  bridge: 'cross-chain bridges',
  transfer: 'transfers',
  nanopay: 'nanopayments',
  solpay: 'Solana payments',
  x402: 'x402 payments',
  onramp: 'crypto onramps',
  offramp: 'crypto offramps',
  deposit: 'deposits',
  withdrawal: 'withdrawals',
};

function networkLabel(type: string, chain?: string | null) {
  // Plain names: the chain's own logo is drawn on the row's icon (see PaymentRow), not an emoji in the text.
  if (chain === 'solana') return 'Solana';
  if (chain === 'evm') return 'Base';
  if (chain === 'xrpl') return 'XRP';
  if (chain === 'arc') return 'Arc';
  if (chain === 'zcash') return 'Zcash';
  if (chain === 'hyperliquid') return 'Hyperliquid';
  if (chain === 'robinhood') return 'Robinhood Chain';
  if (chain === 'tempo') return 'Tempo';
  if (chain === 'doma') return 'Doma';
  if (chain === 'backpack') return 'Backpack';
  return TYPE_META[type]?.network ?? '';
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

const money = (n: number) => `$${n >= 0.01 ? n.toFixed(2) : n.toFixed(6)}`;

function WeeklyInsight({ onAsk }: { onAsk: (prompt: string) => void }) {
  const { insight, isLoading, isGenerating, error, generate } = useWeeklyInsight();
  if (!isLoading && !isGenerating && !insight && !error) return null;

  const delta = insight ? parseFloat(insight.balanceDeltaUsd ?? '0') : null;
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>✨ Weekly insight</Text>
        <Pressable onPress={generate} disabled={isGenerating} hitSlop={8}>
          <Text style={[styles.link, isGenerating && { opacity: 0.4 }]}>{isGenerating ? 'Generating…' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {(isLoading || isGenerating) && !insight ? (
        <View style={{ gap: 8 }}>
          {[1, 0.85, 0.6].map((w, i) => (
            <View key={i} style={[styles.skeleton, { width: `${w * 100}%` }]} />
          ))}
        </View>
      ) : insight ? (
        <>
          <Text style={styles.insightText}>{insight.summary}</Text>
          <View style={styles.chips}>
            {insight.topCategory ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>Top: {CATEGORY_LABELS[insight.topCategory] ?? insight.topCategory}</Text>
              </View>
            ) : null}
            {delta !== null ? (
              <View style={[styles.chip, { borderColor: delta >= 0 ? Colors.borderSage : 'rgba(224,82,82,0.3)' }]}>
                <Text style={[styles.chipText, { color: delta >= 0 ? Colors.sage : Colors.redAlert }]}>
                  Balance {delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(2)}
                </Text>
              </View>
            ) : null}
            <Text style={styles.tiny}>Week of {insight.weekStart}</Text>
          </View>
          <Pressable onPress={() => onAsk('Look at my recent transactions and spending. What stands out, and how can I spend smarter?')} hitSlop={6}>
            <Text style={styles.link}>Ask AI about my spending ›</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.sub}>{error}</Text>
      )}
    </View>
  );
}

function PaymentRow({ payment, onAsk }: { payment: Payment; onAsk: (prompt: string) => void }) {
  const meta = TYPE_META[payment.type] ?? { icon: '💳', label: payment.type };
  const status = normalizeStatus(payment.status);
  const st = STATUS[status];
  const net = networkLabel(payment.type, payment.chain);
  const netLogo = net ? chainLogoByName(net) : null;
  const amt = parseFloat(payment.amountUsdc ?? '0');
  const waiting = status === 'pending' || status === 'processing';

  const ask = () =>
    onAsk(
      waiting
        ? `Check the status of this transaction and tell me if anything is wrong: "${payment.description}" (${payment.type}, $${amt}, started ${formatDate(payment.createdAt)}${payment.referenceId ? `, reference ${payment.referenceId}` : ''}).`
        : `Tell me about this transaction: "${payment.description}" (${payment.type}, $${amt}, ${status}, ${formatDate(payment.createdAt)}).`,
    );

  return (
    <Pressable onPress={ask} style={styles.row} accessibilityRole="button" accessibilityLabel={`${payment.description}, ${st.label}`}>
      <View style={styles.icon}>
        <Text style={{ fontSize: 20 }}>{meta.icon}</Text>
        {netLogo ? (
          <View style={styles.netBadge}>
            <RoundLogo spec={netLogo} size={14} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {payment.description ?? meta.label}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {meta.label}
          {net ? ` · ${net}` : ''} · {formatDate(payment.createdAt)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.amount}>{money(amt)}</Text>
        <View style={styles.statusRow}>
          {waiting ? <ActivityIndicator size="small" color={st.color} style={{ transform: [{ scale: 0.6 }], marginRight: -2 }} /> : null}
          <Text style={[styles.status, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function HistorySection({ onAsk }: { onAsk: (prompt: string) => void }) {
  const { payments, pendingCount, isLoading, isError, refetch } = useHistory();
  const total = payments.reduce((sum, p) => sum + (normalizeStatus(p.status) !== 'failed' ? parseFloat(p.amountUsdc ?? '0') : 0), 0);

  return (
    <View style={styles.stack}>
      <View style={[styles.card, styles.summary]}>
        <Text style={styles.label}>Total transacted</Text>
        <Text style={styles.total}>${total.toFixed(2)}</Text>
        <Text style={styles.sub}>
          {payments.length} transaction{payments.length !== 1 ? 's' : ''}
          {pendingCount > 0 ? ` · ${pendingCount} updating live` : ''}
        </Text>
      </View>

      <WeeklyInsight onAsk={onAsk} />

      {isLoading ? (
        <View style={{ gap: Spacing.sm }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.skeleton, { height: 64, borderRadius: Radii.xl }]} />
          ))}
        </View>
      ) : isError && payments.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.sub}>Couldn't load your history.</Text>
          <Pressable onPress={() => refetch()} hitSlop={8}>
            <Text style={styles.link}>Retry</Text>
          </Pressable>
        </View>
      ) : payments.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 36 }}>💳</Text>
          <Text style={styles.rowTitle}>No transactions yet</Text>
          <Text style={styles.sub}>Pay a bill, invest, bridge, or send crypto to see your history here</Text>
        </View>
      ) : (
        payments.map((p) => <PaymentRow key={p.id} payment={p} onAsk={onAsk} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.md },
  card: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  // Design-system card: BG-1 surface with the sage-tinted border (sage is for text/borders, not a filled surface).
  summary: { borderColor: Colors.borderSage, borderRadius: Radii.xxl, padding: Spacing.xl },
  label: { ...Type.label, color: Colors.tx1 },
  total: { ...Type.amount, fontSize: 32, lineHeight: 40, color: Colors.tx0 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  insightText: { ...Type.body, color: Colors.tx0, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: 'rgba(242,240,232,0.04)', paddingVertical: 4, paddingHorizontal: 10 },
  chipText: { ...Type.small, color: Colors.tx1 },
  tiny: { ...Type.small, fontSize: 11, color: Colors.tx1 },
  link: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.sage },
  skeleton: { height: 12, borderRadius: 6, backgroundColor: 'rgba(242,240,232,0.06)' },
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
  icon: { width: 40, height: 40, borderRadius: Radii.lg, backgroundColor: 'rgba(242,240,232,0.06)', alignItems: 'center', justifyContent: 'center' },
  netBadge: { position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.bg0, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...Type.h3, color: Colors.tx0 },
  sub: { ...Type.small, color: Colors.tx1 },
  amount: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  status: { ...Type.small, fontFamily: Fonts.sansMedium },
  empty: { alignItems: 'center', gap: 6, paddingVertical: Spacing.xxxl },
});
