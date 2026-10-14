import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
import { payDepositFromWallet } from '@/lib/chain-swap-client';
import { friendlyEvmError } from '@/lib/payments/evm-pay';

/** Sends already made this session, so reopening or re-rendering a card can't pay the same deposit twice. */
const sentByKey = new Set<string>();

/**
 * Robinhood Chain deposits: one tap sends the ETH straight from the Bluvfi wallet to the address shown, and records the transfer's hash on
 * the swap so it can be traced. Used by the assistant's Bitrefill result when a payment is made with Robinhood Chain ETH.
 */
export function RobinhoodWalletPay({ address, amount, invoiceId, walletRequestId }: { address: string; amount: string; invoiceId?: string; walletRequestId?: string }) {
  const call = useApiClient();
  const { getEvmWallet } = useAuth();
  const key = `rh_${invoiceId ?? address}`;
  const [sent, setSent] = useState(sentByKey.has(key));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (sent) {
    return (
      <View style={styles.sent}>
        <Text style={styles.sentText}>Sent from your Bluvfi wallet ✓ Confirming…</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Button
        variant="secondary"
        fullWidth
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setErr(null);
          try {
            await payDepositFromWallet({ chain: 'robinhood', depositAddress: address, amount, wallet: getEvmWallet(), ...(walletRequestId ? { track: { walletRequestId, call } } : {}) });
            sentByKey.add(key);
            setSent(true);
          } catch (e) {
            setErr(friendlyEvmError(e, 'Robinhood Chain'));
          } finally {
            setBusy(false);
          }
        }}
      >
        {`Send ${amount} ETH from my Bluvfi wallet`}
      </Button>
      {err ? <Text style={styles.error}>{err}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sent: { backgroundColor: 'rgba(143,174,130,0.1)', borderRadius: Radii.lg, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  sentText: { ...Type.small, color: Colors.sage },
  error: { ...Type.small, color: Colors.redAlert },
});
