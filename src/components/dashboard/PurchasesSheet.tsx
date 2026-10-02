import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, Spacing, Type } from '@/constants/theme';
import type { Payment } from '@/lib/api-types';
import { PurchaseRow } from './PurchaseRow';

interface PurchasesSheetProps {
  open: boolean;
  onClose: () => void;
  purchases: Payment[];
}

/** Full purchase history for digital products (gift cards, top-ups, eSIMs), newest first. */
export function PurchasesSheet({ open, onClose, purchases }: PurchasesSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Purchase history" snapPoints={['85%']} scrollable>
      <Text style={styles.subtitle}>
        {purchases.length} purchase{purchases.length !== 1 ? 's' : ''}
      </Text>
      <View style={styles.list}>
        {purchases.map((p) => (
          <PurchaseRow key={p.id} payment={p} />
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...Type.body,
    color: Colors.tx1,
    marginBottom: Spacing.lg,
  },
  list: {
    gap: Spacing.sm,
  },
});
