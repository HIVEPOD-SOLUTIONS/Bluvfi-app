import { StyleSheet, Text, View } from 'react-native';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import type { Payment } from '@/lib/api-types';

function statusToBadge(status: string): BadgeVariant {
  if (status === 'completed' || status === 'paid') return 'live';
  if (status === 'failed') return 'failed';
  return 'pending';
}

/** "Purchased Netflix via usdc_base" -> { title: "Netflix", method: "USDC · Base" } */
function parseDescription(description: string | null): { title: string; method?: string } {
  const text = (description ?? '').trim();
  if (!text) return { title: 'Digital product' };
  const match = text.match(/^Purchased\s+(.+?)(?:\s+via\s+(.+))?$/i);
  if (!match) return { title: text };
  const method = match[2]
    ?.split('_')
    .map((w, i) => (i === 0 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' · ');
  return { title: match[1], method };
}

export function PurchaseRow({ payment }: { payment: Payment }) {
  const { title, method } = parseDescription(payment.description);
  const amount = Number(payment.amountUsdc);
  const date = new Date(payment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {method ? `${date} · ${method}` : date}
        </Text>
      </View>
      {amount > 0 && <Text style={styles.amount}>${amount.toFixed(2)}</Text>}
      <Badge variant={statusToBadge(payment.status)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg1,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  title: {
    ...Type.h3,
    color: Colors.tx0,
  },
  sub: {
    ...Type.small,
    color: Colors.tx1,
    marginTop: 2,
  },
  amount: {
    ...Type.body,
    fontFamily: Type.amount.fontFamily,
    color: Colors.tx0,
  },
});
