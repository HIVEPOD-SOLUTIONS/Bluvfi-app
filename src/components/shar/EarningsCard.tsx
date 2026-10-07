import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { microToUsd, useEarnings, useWithdraw } from '@/hooks/use-shar';
import { useConnectedWallet } from '@/lib/wallet-connection';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SNAP_POINTS = ['64%'];
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  requested: { label: 'In review', color: Colors.amber },
  sending: { label: 'Sending', color: SharColors.glow },
  paid: { label: 'Paid', color: Colors.sage },
  rejected: { label: 'Declined', color: Colors.redAlert },
};

/** An owner's commission from paid calls, and withdrawing it as SKR (a person at Bluvfi sends each one). */
export function EarningsCard({ onWithdraw }: { onWithdraw: () => void }) {
  const earnings = useEarnings();
  const e = earnings.data;
  if (!e || !e.ready) return null;

  const reason = e.open
    ? 'You have a withdrawal in progress.'
    : e.availableMicro < e.minWithdrawMicro
      ? `Withdraw from ${microToUsd(e.minWithdrawMicro)}.`
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.title}>Commission</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>You keep {e.ownerPct}%</Text>
        </View>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>AVAILABLE</Text>
          <Text style={styles.statValue}>{microToUsd(e.availableMicro)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>EARNED</Text>
          <Text style={styles.statValue}>{microToUsd(e.lifetimeMicro)}</Text>
        </View>
      </View>
      <Button fullWidth disabled={!e.canWithdraw} onPress={onWithdraw}>
        Withdraw as SKR
      </Button>
      {reason ? <Text style={styles.muted}>{reason}</Text> : <Text style={styles.muted}>Paid in SKR, priced when we send it.</Text>}

      {e.payouts.length > 0 ? (
        <View style={styles.list}>
          {e.payouts.slice(0, 4).map((p) => {
            const s = STATUS_LABEL[p.status] ?? STATUS_LABEL.requested;
            return (
              <View key={p.id} style={styles.payoutRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payoutTitle}>{microToUsd(p.usdMicro)}{p.skrMicro ? `  →  ${(p.skrMicro / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })} SKR` : ''}</Text>
                  <Text style={styles.payoutSub}>{new Date(p.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
                </View>
                <Text style={[styles.status, { color: s.color }]}>{s.label}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Render this at screen level, not inside the card: a sheet inside a card is clipped to the card. */
export function WithdrawSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const earnings = useEarnings().data;
  const toast = useToast();
  const { wallet } = useConnectedWallet();
  const withdraw = useWithdraw();
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAddress((a) => a || wallet?.address || '');
    setError(null);
  }, [open, wallet?.address]);

  const valid = BASE58.test(address.trim());
  const submit = async () => {
    setError(null);
    try {
      await withdraw.mutateAsync(address.trim());
      toast({ variant: 'success', title: 'Withdrawal requested', subtitle: `${microToUsd(earnings?.availableMicro ?? 0)} → SKR` });
      onClose();
    } catch (e) {
      setError((e as Error)?.message ?? 'Couldn’t request that withdrawal.');
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Withdraw as SKR" snapPoints={SNAP_POINTS} scrollable>
      <Text style={styles.lead}>
        We’ll send SKR worth <Text style={{ color: Colors.tx0 }}>{microToUsd(earnings?.availableMicro ?? 0)}</Text> to your wallet. The SKR amount is set at the price when we send it, and a person at Bluvfi checks every payout first.
      </Text>
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
      <Text style={styles.muted}>Double-check the address: SKR sent to the wrong wallet can’t be recovered.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={{ marginTop: Spacing.lg }}>
        <Button fullWidth disabled={!valid} loading={withdraw.isPending} onPress={submit}>
          Request withdrawal
        </Button>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.xl, gap: Spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...Type.h2, color: Colors.tx0 },
  pill: { backgroundColor: SharColors.tint, borderRadius: 999, borderWidth: 1, borderColor: SharColors.tintBorder, paddingVertical: 2, paddingHorizontal: 10 },
  pillText: { fontFamily: Fonts.monoBold, fontSize: 12, color: SharColors.glow },
  stats: { flexDirection: 'row', gap: Spacing.md },
  stat: { flex: 1, backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 2 },
  statLabel: { ...Type.label, color: Colors.tx2 },
  statValue: { fontFamily: Fonts.monoBold, fontSize: 18, color: Colors.tx0 },
  muted: { ...Type.small, color: Colors.tx2 },
  list: { marginTop: Spacing.xs },
  payoutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  payoutTitle: { ...Type.body, color: Colors.tx0 },
  payoutSub: { ...Type.small, color: Colors.tx2 },
  status: { fontFamily: Fonts.monoBold, fontSize: 11 },
  lead: { ...Type.body, color: Colors.tx1, marginBottom: Spacing.lg },
  label: { ...Type.label, color: Colors.tx2, marginBottom: Spacing.xs },
  input: { backgroundColor: Colors.bg2, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: Spacing.lg, color: Colors.tx0, fontFamily: Type.body.fontFamily, fontSize: 15 },
  mono: { fontFamily: Fonts.mono, fontSize: 12 },
  link: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline', marginTop: Spacing.xs },
  error: { ...Type.small, color: Colors.redAlert, marginTop: Spacing.md },
});
