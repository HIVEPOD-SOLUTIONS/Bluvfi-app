import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEmbeddedEthereumWallet, useEmbeddedSolanaWallet } from '@privy-io/expo';
import { ChainLabel } from '@/components/dashboard/PaymentMethodPicker';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { sendUsdcEvm, EVM_BILL_RECEIVER } from '@/lib/payments/evm';
import { sendUsdcSolana, SOLANA_BILL_RECEIVER } from '@/lib/payments/solana';
import { useApiClient } from '@/hooks/use-api';

type Network = 'evm' | 'solana';

interface PaymentConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  icon: string;
  amount: number;
  /** Used to tag the /api/payments record (e.g. "bill", "investment"). */
  paymentType: string;
  referenceId: string;
  onSuccess?: (result: { txHash: string | null; chain: Network }) => void;
}

function fmtUsdc(n: number): string {
  if (n >= 0.01) return n.toFixed(2);
  if (n >= 0.0001) return n.toFixed(4);
  return n.toFixed(6);
}

export function PaymentConfirmSheet({
  open,
  onClose,
  title,
  subtitle,
  icon,
  amount,
  paymentType,
  referenceId,
  onSuccess,
}: PaymentConfirmSheetProps) {
  const { evmAddress, solanaAddress } = useAuth();
  const apiCall = useApiClient();
  const ethereum = useEmbeddedEthereumWallet();
  const solana = useEmbeddedSolanaWallet();
  const hasEvm = !!evmAddress;
  const hasSolana = !!solanaAddress;
  const [network, setNetwork] = useState<Network>(hasEvm ? 'evm' : 'solana');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const payEvm = useCallback(async (): Promise<string | null> => {
    const wallet = ethereum.wallets[0];
    if (!wallet || !evmAddress) throw new Error('No EVM wallet connected');
    const provider = await wallet.getProvider();
    return sendUsdcEvm(provider, evmAddress, EVM_BILL_RECEIVER, amount);
  }, [ethereum, evmAddress, amount]);

  const paySolana = useCallback(async (): Promise<string | null> => {
    const wallet = solana.wallets?.[0];
    if (!wallet || !solanaAddress) throw new Error('No Solana wallet connected');
    const provider = await wallet.getProvider();
    return sendUsdcSolana(provider, solanaAddress, SOLANA_BILL_RECEIVER, amount);
  }, [solana, solanaAddress, amount]);

  const handleConfirm = useCallback(async () => {
    if (status === 'pending' || status === 'success') return;
    setStatus('pending');
    setError(null);
    try {
      const txHash = network === 'solana' ? await paySolana() : await payEvm();

      apiCall('/api/payments', {
        method: 'POST',
        body: {
          type: paymentType,
          referenceId,
          description: title,
          amountUsdc: amount.toFixed(6),
          status: 'completed',
          txHash: txHash ?? null,
          chain: network,
        },
      }).catch(() => {});

      setStatus('success');
      onSuccess?.({ txHash, chain: network });
    } catch (err) {
      const msg = ((err as Error)?.message ?? '').toLowerCase();
      setError(
        msg.includes('reject') || msg.includes('cancel') || msg.includes('denied')
          ? 'Payment cancelled.'
          : (err as Error)?.message || 'Payment could not be processed. Please try again.',
      );
      setStatus('error');
    }
  }, [status, network, payEvm, paySolana, apiCall, paymentType, referenceId, title, amount, onSuccess]);

  const isBusy = status === 'pending';
  let ctaLabel = `Pay $${fmtUsdc(amount)}`;
  if (status === 'pending') ctaLabel = 'Confirm in wallet…';
  if (status === 'success') ctaLabel = 'Paid ✓';

  return (
    <BottomSheet open={open} onClose={onClose} title="Confirm Payment">
      <View style={styles.detailCard}>
        <View style={styles.detailHeader}>
          <Text style={styles.icon}>{icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        </View>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Amount due</Text>
          <Text style={styles.amount}>${fmtUsdc(amount)}</Text>
        </View>
      </View>

      {hasEvm && hasSolana && (
        <View style={styles.networkRow}>
          <Pressable
            onPress={() => setNetwork('evm')}
            disabled={isBusy}
            style={[styles.networkButton, network === 'evm' && styles.networkButtonActive]}
          >
            <ChainLabel name="Base" textStyle={[styles.networkLabel, network === 'evm' && styles.networkLabelActive]} size={16} />
          </Pressable>
          <Pressable
            onPress={() => setNetwork('solana')}
            disabled={isBusy}
            style={[styles.networkButton, network === 'solana' && styles.networkButtonActive]}
          >
            <ChainLabel name="Solana" textStyle={[styles.networkLabel, network === 'solana' && styles.networkLabelActive]} size={16} />
          </Pressable>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Button
        variant="secondary"
        fullWidth
        loading={isBusy}
        disabled={status === 'success' || (network === 'solana' && !hasSolana) || (network === 'evm' && !hasEvm)}
        onPress={handleConfirm}
      >
        {ctaLabel}
      </Button>
      <View style={{ height: Spacing.sm }} />
      <Button variant="ghost" fullWidth disabled={isBusy} onPress={onClose}>
        Cancel
      </Button>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  detailCard: {
    backgroundColor: Colors.bg0,
    borderRadius: Radii.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    ...Type.h2,
    color: Colors.tx0,
  },
  subtitle: {
    ...Type.body,
    color: Colors.tx1,
    marginTop: 2,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  amountLabel: {
    ...Type.body,
    color: Colors.tx1,
  },
  amount: {
    ...Type.h1,
    color: Colors.tx0,
  },
  networkRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  networkButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  networkButtonActive: {
    borderColor: Colors.borderSage,
    backgroundColor: 'rgba(143,174,130,0.10)',
  },
  networkLabel: {
    ...Type.small,
    color: Colors.tx1,
  },
  networkLabelActive: {
    color: Colors.sage,
  },
  error: {
    ...Type.body,
    color: Colors.redAlert,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
});
