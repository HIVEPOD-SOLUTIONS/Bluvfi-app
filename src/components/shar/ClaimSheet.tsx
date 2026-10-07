import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { useClaimShar, type SharSummary } from '@/hooks/use-shar';
import { useConnectedWallet } from '@/lib/wallet-connection';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
// Constant, so the sheet isn't asked to re-measure on every render of this screen.
const SNAP_POINTS = ['72%'];
const fmt = (n: number) => n.toLocaleString('en-US');

/** Take Shar out as SKR. The SKR amount is fixed when the claim is made; the team sends it and marks the claim paid. */
export function ClaimSheet({ open, onClose, summary }: { open: boolean; onClose: () => void; summary: SharSummary }) {
  const toast = useToast();
  const { wallet } = useConnectedWallet();
  const claim = useClaimShar();
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Start each time with everything available and the connected wallet (if any) filled in.
  useEffect(() => {
    if (!open) return;
    setAmount(String(summary.available));
    setAddress((a) => a || wallet?.address || '');
    setError(null);
  }, [open, summary.available, wallet?.address]);

  const shar = Number(amount);
  const valid = Number.isInteger(shar) && shar >= summary.claim.minShar && shar <= summary.available && BASE58.test(address.trim());
  const skr = Number.isFinite(shar) ? +(shar * summary.skr.perShar).toFixed(6) : 0;

  const submit = async () => {
    setError(null);
    try {
      const res = await claim.mutateAsync({ shar, wallet: address.trim() });
      toast({ variant: 'success', title: 'Claim sent', subtitle: `${fmt(res.claim.shar)} Shar → ${res.claim.skr} SKR` });
      onClose();
    } catch (e) {
      setError((e as Error)?.message ?? 'Couldn’t send the claim. Try again.');
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Claim as SKR" snapPoints={SNAP_POINTS} scrollable>
      <Text style={styles.lead}>
        Choose how much to claim. We send the SKR to your wallet, and the amount is fixed now, so price moves don’t change it.
      </Text>

      <Text style={styles.label}>Shar to claim</Text>
      <BottomSheetTextInput
        style={styles.input}
        value={amount}
        onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        placeholder={`${fmt(summary.claim.minShar)} or more`}
        placeholderTextColor={Colors.tx2}
      />
      <Text style={styles.hint}>
        {fmt(summary.available)} available · minimum {fmt(summary.claim.minShar)}
      </Text>

      <View style={styles.result}>
        <Text style={styles.resultLabel}>YOU RECEIVE</Text>
        <Text style={styles.resultValue}>{valid || shar > 0 ? `${skr} SKR` : '—'}</Text>
      </View>

      <Text style={styles.label}>Solana wallet to receive it</Text>
      <BottomSheetTextInput
        style={[styles.input, styles.mono]}
        value={address}
        onChangeText={setAddress}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Paste a Solana address"
        placeholderTextColor={Colors.tx2}
      />
      {wallet && address !== wallet.address ? (
        <Text style={styles.link} onPress={() => setAddress(wallet.address)}>
          Use my connected {wallet.name} wallet
        </Text>
      ) : null}
      <Text style={styles.hint}>Double-check the address: SKR sent to the wrong wallet can’t be recovered.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={{ marginTop: Spacing.lg }}>
        <Button fullWidth disabled={!valid} loading={claim.isPending} onPress={submit}>
          Send claim
        </Button>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  lead: { ...Type.body, color: Colors.tx1, marginBottom: Spacing.lg },
  label: { ...Type.label, color: Colors.tx2, marginBottom: Spacing.xs, marginTop: Spacing.md },
  input: {
    backgroundColor: Colors.bg2,
    borderRadius: Radii.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    color: Colors.tx0,
    fontFamily: Type.body.fontFamily,
    fontSize: 15,
  },
  mono: { fontFamily: 'SpaceMono_400Regular', fontSize: 12 },
  hint: { ...Type.small, color: Colors.tx2, marginTop: Spacing.xs },
  link: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline', marginTop: Spacing.xs },
  result: {
    marginTop: Spacing.lg,
    backgroundColor: SharColors.tint,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: SharColors.tintBorder,
    padding: Spacing.lg,
    gap: 4,
  },
  resultLabel: { ...Type.label, color: Colors.tx2 },
  resultValue: { ...Type.amount, color: Colors.tx0 },
  error: { ...Type.small, color: Colors.redAlert, marginTop: Spacing.md },
});
