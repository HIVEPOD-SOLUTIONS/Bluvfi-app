import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCodeStyled from 'react-native-qrcode-styled';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { RoundLogo } from './PaymentMethodPicker';
import type { LogoSpec } from '@/lib/payment-logos';

export interface DepositInfo {
  address: string;
  /** The exact amount to send, in the coin (not dollars). */
  amount: string | null;
  /** "USDT", "BTC", "XRP"… */
  currency: string;
  /** "Tron", "Bitcoin", "XRP Ledger"… */
  network: string;
  /** A wallet link that fills in the address and amount (shown as the QR when present). */
  paymentUri?: string | null;
  /** Where Bitrefill's own page shows the exact amount, for the methods that give no amount. */
  paymentLink?: string | null;
  expiresInMinutes?: number | null;
  /** A memo or tag the payment MUST include (some chains need one). */
  memo?: string | null;
}

interface Props {
  info: DepositInfo;
  logo: LogoSpec;
  /** What the order is doing right now ("Waiting for your payment…"). */
  status: string;
  /** An extra action, such as paying XRP from the Bluvfi XRP wallet. */
  action?: { label: string; onPress: () => void; loading?: boolean; error?: string | null } | null;
  /** Extra guidance under the warning (how to pay it, where a failed payment is refunded). */
  note?: string | null;
}

/**
 * The payment step for every method that is sent to a deposit address (Bitcoin, Tron USDT, TON, XRP…), as on the website: the exact amount, the
 * address and a QR to scan. Nothing needs tapping after sending: the order completes by itself, so this just shows what is happening.
 */
export function DepositPanel({ info, logo, status, action, note }: Props) {
  const toast = useToast();
  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    toast({ variant: 'success', title: `${what} copied` });
  };
  const qr = info.paymentUri || info.address;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <RoundLogo spec={logo} size={32} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Send {info.currency} on {info.network}</Text>
          {info.expiresInMinutes ? <Text style={styles.hint}>Open for about {info.expiresInMinutes} minutes</Text> : null}
        </View>
      </View>

      {info.amount ? (
        <Pressable onPress={() => copy(info.amount as string, 'Amount')} accessibilityRole="button" style={styles.amountBox}>
          <Text style={styles.label}>SEND EXACTLY</Text>
          <Text style={styles.amount}>
            {info.amount} {info.currency}
          </Text>
          <Text style={styles.copy}>Tap to copy</Text>
        </Pressable>
      ) : (
        <Text style={styles.warn}>Bitrefill didn’t give an exact amount for this method. Open its checkout page to see it, then send that amount to the address below.</Text>
      )}

      <View style={styles.qr}>
        <QRCodeStyled data={qr} size={168} padding={8} color="#000000" style={{ backgroundColor: '#FFFFFF' }} />
      </View>

      <Pressable onPress={() => copy(info.address, 'Address')} accessibilityRole="button" style={styles.addressBox}>
        <Text selectable style={styles.address}>
          {info.address}
        </Text>
        <Text style={styles.copyLink}>Copy</Text>
      </Pressable>

      {info.memo ? (
        <Pressable onPress={() => copy(info.memo as string, 'Memo')} accessibilityRole="button" style={styles.memoBox}>
          <Text style={styles.warn}>Include this memo with the payment, or it can’t be matched:</Text>
          <Text selectable style={styles.address}>
            {info.memo}
          </Text>
          <Text style={styles.copyLink}>Tap to copy</Text>
        </Pressable>
      ) : null}

      <Text style={styles.warn}>⚠ Only send {info.currency} on {info.network}. Sending anything else, or on another network, can’t be recovered.</Text>

      {note ? <Text style={styles.hint}>{note}</Text> : null}

      {action ? (
        <View style={{ gap: 6 }}>
          <Button variant="secondary" fullWidth loading={action.loading} onPress={action.onPress}>
            {action.label}
          </Button>
          {action.error ? <Text style={styles.error}>{action.error}</Text> : null}
        </View>
      ) : null}

      <View style={styles.status}>
        <ActivityIndicator size="small" color={Colors.sage} />
        <Text style={styles.statusText}>{status}</Text>
      </View>
      <Text style={styles.hint}>No need to tap anything after sending. This updates by itself, and the order shows in your purchase history.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  title: { ...Type.h3, color: Colors.tx0 },
  hint: { ...Type.small, color: Colors.tx2 },
  label: { ...Type.label, color: Colors.tx2 },
  amountBox: { alignItems: 'center', gap: 2, backgroundColor: Colors.bg1, borderRadius: Radii.lg, paddingVertical: Spacing.md },
  amount: { fontFamily: Fonts.monoBold, fontSize: 20, color: Colors.tx0 },
  copy: { ...Type.small, color: Colors.sage },
  qr: { alignItems: 'center' },
  addressBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bg1, borderRadius: Radii.lg, padding: Spacing.md },
  address: { flex: 1, fontFamily: Fonts.mono, fontSize: 12, color: Colors.tx0 },
  memoBox: { gap: 4, backgroundColor: 'rgba(232,168,56,0.08)', borderRadius: Radii.lg, borderWidth: 1, borderColor: 'rgba(232,168,56,0.3)', padding: Spacing.md },
  copyLink: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.sage },
  warn: { ...Type.small, color: Colors.amber },
  error: { ...Type.small, color: Colors.redAlert },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusText: { ...Type.small, color: Colors.tx1, flex: 1 },
});
