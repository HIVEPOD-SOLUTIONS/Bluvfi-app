import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';

/**
 * Generic, read-only renderer for any AI tool's `output-available` result —
 * covers every informational tool (get_bills, get_investments, get_wallet_
 * balance, get_payment_history, get_market_prices, etc.) with one component
 * instead of bespoke cards per tool, which bluvfi web has ~30+ of.
 *
 * Deliberately does not attempt bespoke cards for the two AI-tool-triggered
 * payment flows (buy_investment -> BuyAssetConfirmCard, and PayBillConfirmCard):
 * both are dead/unreachable on the web app itself — buy_investment's tool
 * definition always short-circuits with a "NOT AVAILABLE" error and never
 * emits the `pendingPurchase` flag that would render the card, and
 * PayBillConfirmCard isn't imported anywhere in the live chat UI. Real,
 * reachable payment flows (bill pay, asset buy, onramp) are the dedicated
 * tabs on the Home dashboard instead — see PaymentConfirmSheet / BuyAssetSheet /
 * OnrampSheet.
 */
export function ToolResultCard({ toolName, output }: { toolName: string; output: unknown }) {
  if (output && typeof output === 'object' && 'error' in output) {
    return (
      <View style={[styles.card, styles.errorCard]}>
        <Text style={styles.errorText}>{String((output as { error: unknown }).error)}</Text>
      </View>
    );
  }

  const rows = summarize(output);
  if (rows.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{formatToolName(toolName)}</Text>
      {rows.map(([key, value]) => (
        <View key={key} style={styles.row}>
          <Text style={styles.key}>{key}</Text>
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
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
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    maxWidth: '90%',
    alignSelf: 'flex-start',
    gap: 6,
  },
  errorCard: {
    backgroundColor: 'rgba(224,82,82,0.08)',
  },
  errorText: {
    ...Type.body,
    color: Colors.redAlert,
  },
  label: {
    ...Type.label,
    color: Colors.tx2,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  key: {
    ...Type.small,
    color: Colors.tx1,
    textTransform: 'capitalize',
  },
  value: {
    ...Type.small,
    color: Colors.tx0,
    flexShrink: 1,
    textAlign: 'right',
  },
});
