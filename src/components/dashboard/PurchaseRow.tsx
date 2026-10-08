import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import type { Payment } from '@/lib/api-types';
import { parsePurchase, statusInfo, type StatusTone } from '@/lib/purchase-detail';

const VARIANT: Record<StatusTone, BadgeVariant> = { success: 'live', danger: 'failed', pending: 'pending' };

/** One purchase. Tapping it (when `onPress` is given) opens its details. */
export function PurchaseRow({ payment, onPress }: { payment: Payment; onPress?: () => void }) {
  const { title, method } = parsePurchase(payment.description);
  const amount = Number(payment.amountUsdc);
  const date = new Date(payment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const status = statusInfo(payment.status);

  const content = (
    <>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {method ? `${date} · ${method}` : date}
        </Text>
      </View>
      <View style={styles.right}>
        {amount > 0 && <Text style={styles.amount}>${amount.toFixed(2)}</Text>}
        <Badge variant={VARIANT[status.tone]}>{status.label}</Badge>
      </View>
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, ${status.label}. Open details`} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  right: {
    alignItems: 'flex-end',
    gap: 6,
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
  chevron: {
    ...Type.h2,
    color: Colors.tx2,
  },
});
