import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { buildTransfer, friendlyWalletError, type TransferAsset } from '@/lib/mwa';
import { sendFromWallet, walletRailFor } from '@/lib/payments/wallet-send';
import { useConnectedWallet } from '@/lib/wallet-connection';

/** Sends already made this session, so re-rendering or reopening a card can't pay the same order twice. */
const sentByOrder = new Map<string, string>();

/** Records a send made outside this button (e.g. the automatic fallback payment), so the button shows "sent". */
export function markSentFromWallet(orderKey: string, hash: string) {
  sentByOrder.set(orderKey, hash);
}

/**
 * One-tap payment of a deposit address ("send X COIN on NETWORK to ADDRESS") from the Bluvfi wallet, when it
 * can hold that coin on that network (see wallet-send.ts). Used by the Cryptorefills deposit panel and by
 * Bitrefill's ETH / SOL address-based methods. Renders nothing when the wallet can't pay it.
 */
export function PayFromWallet({
  coin,
  network,
  address,
  amount,
  orderKey,
  sentLabel = 'Sent from your wallet ✓',
}: {
  coin: string;
  network: string;
  address?: string;
  amount?: string;
  /** Identifies the order, so it is only paid once. */
  orderKey: string;
  sentLabel?: string;
}) {
  const { getEvmWallet, getSolanaProvider, solanaAddress } = useAuth();
  const rail = walletRailFor(coin, network);
  const [sent, setSent] = useState<string | null>(sentByOrder.get(orderKey) ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { wallet: connected, send: sendFromConnected } = useConnectedWallet();
  const [connBusy, setConnBusy] = useState(false);
  if (!rail || !address || !(Number(amount) > 0)) return null;

  // A wallet connected through Mobile Wallet Adapter can pay Solana deposit addresses too, signing in its own app.
  const canUseConnected = rail.kind === 'solana' && !!connected && (coin === 'SOL' || coin === 'USDC' || coin === 'USDT');
  const payConnected = async () => {
    setConnBusy(true);
    setErr(null);
    try {
      const sig = await sendFromConnected((payer, connection) =>
        buildTransfer({ payer, connection, to: address, asset: coin as TransferAsset, amount: amount! }),
      );
      sentByOrder.set(orderKey, sig);
      setSent(sig);
    } catch (e) {
      setErr(friendlyWalletError(e).message);
    } finally {
      setConnBusy(false);
    }
  };

  const pay = async () => {
    setBusy(true);
    setErr(null);
    try {
      const hash = await sendFromWallet({
        rail,
        coin,
        to: address,
        amount: amount!,
        evmWallet: getEvmWallet,
        solana: solanaAddress ? { address: solanaAddress, getProvider: getSolanaProvider } : undefined,
      });
      sentByOrder.set(orderKey, hash);
      setSent(hash);
    } catch (e) {
      const m = (e as Error)?.message ?? 'Payment failed.';
      setErr(
        /reject|denied|cancel/i.test(m)
          ? 'Cancelled. Nothing was sent.'
          : /insufficient|exceeds balance|not enough/i.test(m)
            ? `Not enough ${coin} on ${network} in your wallet. Send it from another wallet using the address above.`
            : m.split('\n')[0],
      );
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.sent}>
        <Text style={styles.sentText}>{sentLabel}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Button variant="secondary" fullWidth loading={busy} disabled={connBusy} onPress={pay}>
        {`Pay ${amount} ${coin} from my wallet`}
      </Button>
      {canUseConnected ? (
        <Button variant="outline" fullWidth loading={connBusy} disabled={busy} onPress={payConnected}>
          {`Pay with ${connected!.name}`}
        </Button>
      ) : null}
      {err ? <Text style={styles.error}>{err}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sent: { backgroundColor: 'rgba(143,174,130,0.1)', borderRadius: Radii.lg, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  sentText: { ...Type.small, color: Colors.sage },
  error: { ...Type.small, color: Colors.redAlert },
});
