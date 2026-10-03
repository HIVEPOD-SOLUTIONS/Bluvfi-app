import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { PayFromWallet } from './PayFromWallet';

/**
 * Renders an AI tool's `output-available` result in the chat. The tools bluvfi's assistant most often
 * returns (product details, orders, bills, market prices, payment history, wallet balance) get the same
 * cards as the web chat; any other informational tool falls back to a generic key/value card.
 */
export function ToolResultCard({ toolName, output }: { toolName: string; output: unknown }) {
  let data: any = output;
  if (typeof output === 'string') {
    try {
      data = JSON.parse(output);
    } catch {
      return null;
    }
  }

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return (
      <View style={[styles.card, styles.errorCard]}>
        <Text style={styles.errorText}>{String(data.error)}</Text>
      </View>
    );
  }

  // buy_bitrefill_product: invoice created, waiting on payment.
  if (toolName === 'buy_bitrefill_product' && data?.pendingBitrefillPayment) {
    return <PendingPaymentCard data={data} />;
  }

  // buy_bitrefill_product after the payment card reported back: a short confirmation (the card itself is gone).
  if (toolName === 'buy_bitrefill_product') {
    if (data?.paid === true) {
      return (
        <View style={[styles.card, styles.successCard]}>
          <Text style={styles.successTitle}>✓ Payment sent — confirming with Bitrefill…</Text>
        </View>
      );
    }
    return null;
  }

  // get_product_details: the denominations the user can pick from.
  if (toolName === 'get_product_details') {
    const packages: { package_value: string; price_usd?: number }[] = data?.packages ?? [];
    const range = data?.range as { min: number; max: number; step: number } | null;
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>
            {data?.name ?? data?.id}
          </Text>
          {data?.recipient_type ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{String(data.recipient_type).replace(/_/g, ' ')}</Text>
            </View>
          ) : null}
        </View>
        {packages.length > 0 ? (
          <View style={styles.chips}>
            {packages.map((p) => (
              <View key={p.package_value} style={styles.chip}>
                <Text style={styles.chipText}>{p.price_usd != null ? `$${p.price_usd}` : p.package_value}</Text>
              </View>
            ))}
          </View>
        ) : range ? (
          <Text style={styles.sub}>
            Custom amount: ${range.min}–${range.max} (step ${range.step})
          </Text>
        ) : null}
      </View>
    );
  }

  // poll_bitrefill_order: code ready, failed, or still in progress.
  if (toolName === 'poll_bitrefill_order') return <OrderStatusCard data={data} />;

  if (toolName === 'get_bills' && Array.isArray(data?.bills)) {
    return (
      <ListCard
        title="Bills & Subscriptions"
        rows={data.bills.map((b: any) => ({
          key: String(b.id),
          title: b.name,
          sub: `${b.category ?? ''}${b.dueDay ? ` · due the ${b.dueDay}${ordinal(b.dueDay)}` : ''}`,
          right: `$${Number(b.amount).toFixed(2)}`,
        }))}
      />
    );
  }

  if ((toolName === 'get_investments' || toolName === 'get_market_prices') && Array.isArray(data?.assets)) {
    return (
      <ListCard
        title="Market Prices"
        rows={data.assets.map((a: any) => {
          const change = Number(a.change24h ?? 0);
          return {
            key: String(a.symbol),
            title: a.symbol,
            sub: a.name,
            right: `$${Number(a.priceUsd).toFixed(2)}`,
            rightSub: a.change24h !== undefined ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : undefined,
            rightSubColor: change >= 0 ? Colors.sage : Colors.redAlert,
          };
        })}
      />
    );
  }

  if (toolName === 'get_payment_history' && Array.isArray(data?.payments)) {
    if (data.payments.length === 0) return <ListCard title="Payment History" rows={[]} emptyText="No payments yet." />;
    return (
      <ListCard
        title="Payment History"
        rows={data.payments.map((p: any) => ({
          key: String(p.id),
          title: p.description,
          sub: `${p.createdAt ? new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}${p.type ? ` · ${p.type}` : ''}`,
          right: `$${fmtUsdc(Number(p.amountUsdc))}`,
          rightSub: p.status,
        }))}
      />
    );
  }

  if (toolName === 'get_wallet_balance' && Array.isArray(data?.tokens)) {
    return (
      <ListCard
        title="Wallet balance"
        rows={data.tokens.map((t: any, i: number) => ({ key: String(i), title: t.symbol, right: String(t.balance) }))}
      />
    );
  }

  // Everything else: a compact key/value summary.
  const rows = summarize(data);
  if (rows.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{formatToolName(toolName)}</Text>
      {rows.map(([key, value]) => (
        <View key={key} style={styles.kvRow}>
          <Text style={styles.key}>{key}</Text>
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

/** Bitrefill deposit-address methods the Bluvfi wallet itself can pay (the rest need coins it can't hold, so they stay manual). */
const BITREFILL_WALLET_METHODS: Record<string, { coin: string; network: string }> = {
  ethereum: { coin: 'ETH', network: 'ETH Mainnet' },
  eth_base: { coin: 'ETH', network: 'Base' },
  eth_arbitrum: { coin: 'ETH', network: 'Arbitrum' },
  solana: { coin: 'SOL', network: 'Solana' },
};

function PendingPaymentCard({ data }: { data: any }) {
  const isTopup = !!data.isTopup;
  const walletMethod = BITREFILL_WALLET_METHODS[data.paymentMethod ?? ''];
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>
          {data.paymentAmount != null ? `${data.paymentAmount} ${data.paymentCurrency ?? ''}` : 'Payment pending'}
        </Text>
        {data.expiresInMinutes ? <Text style={styles.tinyText}>Expires in {data.expiresInMinutes}m</Text> : null}
      </View>
      {data.isAddressBased ? (
        <>
          <Text style={styles.warn}>⚠ Send manually — this network isn't paid automatically.</Text>
          <View style={styles.codeBox}>
            <Text style={styles.tinyText}>Deposit address</Text>
            <Text style={styles.mono} selectable>
              {data.paymentAddress}
            </Text>
          </View>
          {walletMethod && data.paymentAmount != null ? (
            <PayFromWallet
              coin={walletMethod.coin}
              network={walletMethod.network}
              address={data.paymentAddress}
              amount={String(data.paymentAmount)}
              orderKey={`br_${data.invoiceId ?? data.paymentAddress}`}
              sentLabel="Sent from your wallet ✓ — ask me to check the order in a minute."
            />
          ) : null}
        </>
      ) : (
        <Text style={styles.sub}>
          Payment confirmation from the app is coming soon. You can finish this purchase on the Bluvfi web app.
        </Text>
      )}
      {data.recipientEmail ? (
        <Text style={styles.sub}>
          {isTopup ? 'Receipt → ' : 'Code → '}
          <Text style={styles.strong}>{data.recipientEmail}</Text>
        </Text>
      ) : null}
      <Text style={styles.tinyMono}>Invoice {data.invoiceId}</Text>
    </View>
  );
}

function OrderStatusCard({ data }: { data: any }) {
  if (data?.status === 'complete' && data?.code) {
    return (
      <View style={[styles.card, styles.successCard]}>
        <Text style={styles.successTitle}>{data.productName ?? 'Digital product'} — Ready ✓</Text>
        <View style={styles.codeBox}>
          <Text style={styles.tinyText}>Redemption Code</Text>
          <Text style={styles.code} selectable>
            {data.code}
          </Text>
        </View>
        {data.esimInstallLink ? (
          <Pressable onPress={() => Linking.openURL(data.esimInstallLink)}>
            <Text style={styles.link}>Install eSIM ↗</Text>
          </Pressable>
        ) : null}
        {data.instructions ? <Text style={styles.sub}>{data.instructions}</Text> : null}
      </View>
    );
  }
  if (data?.status === 'complete') {
    return (
      <View style={[styles.card, styles.successCard]}>
        <Text style={styles.successTitle}>
          {data.productName ?? 'Order'} delivered ✓ — {data.message ?? 'No code required.'}
        </Text>
      </View>
    );
  }
  if (['failed', 'expired', 'cancelled'].includes(data?.status)) {
    return (
      <View style={[styles.card, styles.errorCard]}>
        <Text style={styles.errorText}>{data.error ?? `Payment ${data.status}. Please try again.`}</Text>
      </View>
    );
  }
  const labels: Record<string, string> = {
    payment_detected: 'Payment detected · awaiting confirmation…',
    payment_confirmed: 'Payment confirmed · processing order…',
    pending: 'Processing your order…',
  };
  return (
    <View style={styles.card}>
      <Text style={styles.sub}>{labels[data?.status] ?? 'Waiting for payment confirmation…'}</Text>
    </View>
  );
}

interface ListRow {
  key: string;
  title: string;
  sub?: string;
  right?: string;
  rightSub?: string;
  rightSubColor?: string;
}

function ListCard({ title, rows, emptyText }: { title: string; rows: ListRow[]; emptyText?: string }) {
  return (
    <View style={[styles.card, { padding: 0, overflow: 'hidden', gap: 0 }]}>
      <Text style={[styles.label, { padding: Spacing.lg, paddingBottom: Spacing.sm, marginBottom: 0 }]}>{title}</Text>
      {rows.length === 0 && emptyText ? <Text style={[styles.sub, { padding: Spacing.lg, paddingTop: 0 }]}>{emptyText}</Text> : null}
      {rows.map((r) => (
        <View key={r.key} style={styles.listRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {r.title}
            </Text>
            {r.sub ? (
              <Text style={styles.sub} numberOfLines={1}>
                {r.sub}
              </Text>
            ) : null}
          </View>
          {r.right ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.amount}>{r.right}</Text>
              {r.rightSub ? <Text style={[styles.tinyText, r.rightSubColor ? { color: r.rightSubColor } : null]}>{r.rightSub}</Text> : null}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The right number of decimals for any USDC amount down to $0.000001. */
function fmtUsdc(n: number): string {
  if (n >= 0.01) return n.toFixed(2);
  if (n >= 0.0001) return n.toFixed(4);
  return n.toFixed(6);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Flattens a tool's JSON output into a short, readable list of key/value rows. */
function summarize(output: unknown): [string, string][] {
  if (output == null) return [];
  if (Array.isArray(output)) {
    return output.slice(0, 5).map((item, i) => [String(i + 1), summarizeItem(item)]);
  }
  if (typeof output === 'object') {
    const entries = Object.entries(output as Record<string, unknown>).filter(
      ([k]) => !['success', 'action'].includes(k),
    );
    return entries.slice(0, 8).map(([k, v]) => [k, summarizeItem(v)]);
  }
  return [['result', String(output)]];
}

function summarizeItem(value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) return `${value.length} item${value.length !== 1 ? 's' : ''}`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const name = obj.name ?? obj.symbol ?? obj.description ?? obj.title;
    const amount = obj.amount ?? obj.amountUsdc ?? obj.currentValueUsd ?? obj.priceUsd;
    if (name && amount !== undefined) return `${name} — $${amount}`;
    if (name) return String(name);
    return JSON.stringify(obj).slice(0, 60);
  }
  return String(value);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    alignSelf: 'stretch',
    gap: 8,
    marginVertical: 4,
  },
  errorCard: { backgroundColor: 'rgba(224,82,82,0.08)', borderColor: 'rgba(224,82,82,0.25)' },
  successCard: { backgroundColor: 'rgba(143,174,130,0.08)', borderColor: Colors.borderSage },
  errorText: { ...Type.body, color: Colors.redAlert },
  successTitle: { ...Type.h3, color: Colors.sage },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  title: { ...Type.h3, color: Colors.tx0, flex: 1 },
  tag: { backgroundColor: Colors.bg2, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  tagText: { ...Type.small, color: Colors.tx1, textTransform: 'capitalize' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.md, paddingVertical: 4, paddingHorizontal: 10 },
  chipText: { ...Type.small, color: Colors.tx0 },
  label: { ...Type.label, color: Colors.tx1, marginBottom: 4 },
  sub: { ...Type.small, color: Colors.tx1 },
  strong: { fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  tinyText: { ...Type.small, fontSize: 11, color: Colors.tx1 },
  tinyMono: { ...Type.small, fontSize: 11, fontFamily: Fonts.mono, color: Colors.tx2 },
  warn: { ...Type.small, color: Colors.amber },
  codeBox: { backgroundColor: Colors.bg0, borderRadius: Radii.md, padding: Spacing.md, gap: 4 },
  mono: { ...Type.small, fontFamily: Fonts.mono, color: Colors.tx0 },
  code: { fontFamily: Fonts.monoBold, fontSize: 16, letterSpacing: 2, color: Colors.sage },
  link: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline' },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  key: { ...Type.small, color: Colors.tx1, textTransform: 'capitalize' },
  value: { ...Type.small, color: Colors.tx0, flexShrink: 1, textAlign: 'right' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rowTitle: { ...Type.body, color: Colors.tx0 },
  amount: { ...Type.small, fontFamily: Fonts.mono, color: Colors.tx0 },
});
