import { StyleSheet, Switch, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { useAuth } from '@/lib/auth-context';
import { useSkrBalance } from '@/lib/skr-balance';
import { useSkrPay } from '@/lib/skr-pay';
import { formatSkr } from '@/lib/skr-swap';
import { useSolanaPaySource } from '@/lib/wallet-connection';

/**
 * "Your SKR": what's in the wallet, a button to convert it to USDC yourself, and the setting that lets a payment do it for you when
 * you're short on USDC. Claimed SKR lands in your wallet; this is how it becomes spending money.
 *
 * The Convert sheet is NOT rendered in here: a sheet inside a card is clipped to the card. The screen owns it and passes `onConvert`.
 */
export function SpendSkrCard({ onConvert }: { onConvert: () => void }) {
  const { solanaAddress, getSolanaProvider } = useAuth();
  const src = useSolanaPaySource({ address: solanaAddress, getProvider: getSolanaProvider });
  const balance = useSkrBalance(src.address);
  const [autoPay, setAutoPay] = useSkrPay();

  if (!src.address) return null;
  const have = balance.data;

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>YOUR SKR · {src.label.toUpperCase()}</Text>
          <Text style={styles.value}>{have === undefined ? '…' : formatSkr(have)} SKR</Text>
        </View>
        <Button size="sm" variant="outline" onPress={onConvert}>
          Convert to USDC
        </Button>
      </View>
      <Text style={styles.body}>Claimed SKR lands in the wallet you chose. Convert it to USDC to spend it (from your Seeker wallet you can send the USDC straight on to your Bluvfi wallet), or let a payment convert just what it needs.</Text>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchTitle}>Use my SKR when I’m short on USDC</Text>
          <Text style={styles.small}>If a payment needs more USDC than you have, Bluvfi converts just the missing amount from your SKR first (you’ll see a note after). Off by default.</Text>
        </View>
        <Switch value={autoPay} onValueChange={setAutoPay} trackColor={{ false: Colors.bg3, true: SharColors.body }} thumbColor="#FFFFFF" accessibilityLabel="Use my SKR when I’m short on USDC" />
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.xl, gap: Spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  eyebrow: { ...Type.label, color: Colors.tx2 },
  value: { fontFamily: Fonts.monoBold, fontSize: 22, color: Colors.tx0, marginTop: 2 },
  body: { ...Type.small, color: Colors.tx1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  switchTitle: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  small: { ...Type.small, color: Colors.tx2, marginTop: 2 },
});
