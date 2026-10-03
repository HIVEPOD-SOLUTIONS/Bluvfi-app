import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import type { StockRow } from '@/hooks/use-stocks';
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

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  logo: { width: 22, height: 22, borderRadius: Radii.sm },
  sub: { ...Type.small, color: Colors.tx1 },
  toggle: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  toggleButton: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: 999, backgroundColor: Colors.bg2 },
  toggleActive: { backgroundColor: Colors.blue },
  toggleText: { ...Type.body, color: Colors.tx1 },
  toggleTextActive: { color: '#FFFFFF' },
});
