import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { microToUsd, useCredits, useTopup } from '@/hooks/use-shar';
import { useAuth } from '@/lib/auth-context';
import { sendFromWallet, walletRailFor } from '@/lib/payments/wallet-send';

// Constant, so the sheet isn't asked to re-measure on every render of the screen behind it.
const SNAP_POINTS = ['86%'];
const CHIPS = ['1', '5', '10', '25'];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;

/** Add USDC credits for paid providers. One tap from the Bluvfi wallet, or paste the signature of a transfer you made yourself. */
export function AddCreditsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const credits = useCredits();
  const topup = useTopup();
  const { solanaAddress, getSolanaProvider } = useAuth();
  const [amount, setAmount] = useState('5');
  const [sending, setSending] = useState(false);
  const [signature, setSignature] = useState('');
  const [error, setError] = useState<string | null>(null);

  const info = credits.data;
  const deposit = info?.depositAddress ?? null;
  const minUsd = (info?.minTopupMicro ?? 1_000_000) / 1_000_000;
  const amountNum = Number(amount);
  const amountOk = /^\d+(\.\d{1,6})?$/.test(amount) && amountNum >= minUsd && amountNum <= 1000;

  /** The server may not see a fresh transaction for a few seconds, so a "not found yet" answer is retried. */
  const verify = async (sig: string) => {
    let lastError = 'Couldn’t verify that deposit.';
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        return await topup.mutateAsync(sig);
      } catch (e) {
        lastError = (e as Error)?.message ?? lastError;
        if (!/can.?t see that transaction yet/i.test(lastError)) break;
        await wait(3000);
      }
    }
    throw new Error(lastError);
  };

  const done = (added: number, balance: number) => {
    toast({ variant: 'success', title: `Added ${microToUsd(added)}`, subtitle: `Balance ${microToUsd(balance)}` });
    setSignature('');
    onClose();
  };

  const sendFromBluvfi = async () => {
    if (!deposit || !solanaAddress || !amountOk) return;
    setError(null);
    setSending(true);
    try {
      const rail = walletRailFor('USDC', 'Solana');
      if (!rail) throw new Error('This wallet can’t send USDC on Solana.');
      const sig = await sendFromWallet({ rail, coin: 'USDC', to: deposit, amount, solana: { address: solanaAddress, getProvider: getSolanaProvider } });
      const res = await verify(sig);
      done(res.amountMicro, res.balanceMicro);
    } catch (e) {
      setError((e as Error)?.message ?? 'Couldn’t add credits. If USDC left your wallet, paste the transaction signature below and it will be credited.');
    } finally {
      setSending(false);
    }
  };

  const verifyPasted = async () => {
    setError(null);
    try {
      const res = await verify(signature.trim());
      if (!res.credited) toast({ variant: 'success', title: 'Already added', subtitle: 'That deposit was credited before.' });
      else done(res.amountMicro, res.balanceMicro);
      if (!res.credited) onClose();
    } catch (e) {
      setError((e as Error)?.message ?? 'Couldn’t verify that deposit.');
    }
  };

  const copy = async () => {
    if (!deposit) return;
    await Clipboard.setStringAsync(deposit);
    toast({ variant: 'success', title: 'Address copied' });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Add credits" snapPoints={SNAP_POINTS} scrollable>
      <Text style={styles.lead}>
        Paid providers charge per call from your credits. If a provider fails, you’re never charged. Credits are USDC on Solana.
      </Text>

      <View style={styles.balance}>
        <Text style={styles.balanceLabel}>YOUR CREDITS</Text>
        <Text style={styles.balanceValue}>{microToUsd(info?.balanceMicro ?? 0)}</Text>
      </View>

      {info && !info.enabled ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Adding credits isn’t switched on yet. Check back soon.</Text>
        </View>
      ) : (
        <>
          <Text style={styles.label}>Amount (USDC)</Text>
          <BottomSheetTextInput
            style={styles.input}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder={`${minUsd} or more`}
            placeholderTextColor={Colors.tx2}
          />
          <View style={styles.chips}>
            {CHIPS.map((c) => (
              <Pressable key={c} onPress={() => setAmount(c)} style={[styles.chip, amount === c && styles.chipOn]}>
                <Text style={[styles.chipText, amount === c && { color: Colors.tx0 }]}>${c}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ marginTop: Spacing.lg }}>
            <Button fullWidth disabled={!amountOk || !deposit || !solanaAddress} loading={sending} onPress={sendFromBluvfi}>
              {sending ? 'Sending…' : `Add $${amountOk ? amountNum : ''} from my Bluvfi wallet`}
            </Button>
          </View>
          {!solanaAddress ? <Text style={styles.hint}>Your Solana wallet is still being set up.</Text> : null}

          <Text style={[styles.label, { marginTop: Spacing.xl }]}>Or send it yourself</Text>
          <Text style={styles.hint}>Send USDC on Solana from any of your wallets to this address, then paste the transaction signature.</Text>
          {deposit ? (
            <Pressable onPress={copy} style={styles.addressBox}>
              <Text style={styles.address} selectable>
                {short(deposit)}
              </Text>
              <Text style={styles.copy}>Copy</Text>
            </Pressable>
          ) : null}
          <BottomSheetTextInput
            style={[styles.input, styles.mono]}
            value={signature}
            onChangeText={setSignature}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Transaction signature"
            placeholderTextColor={Colors.tx2}
          />
          <View style={{ marginTop: Spacing.sm }}>
            <Button variant="outline" fullWidth disabled={signature.trim().length < 64} loading={topup.isPending && !sending} onPress={verifyPasted}>
              Verify my deposit
            </Button>
          </View>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  lead: { ...Type.body, color: Colors.tx1, marginBottom: Spacing.lg },
  balance: { backgroundColor: SharColors.tint, borderRadius: Radii.lg, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.lg, gap: 4 },
  balanceLabel: { ...Type.label, color: Colors.tx2 },
  balanceValue: { ...Type.amount, color: Colors.tx0 },
  notice: { marginTop: Spacing.lg, backgroundColor: 'rgba(232,168,56,0.10)', borderRadius: Radii.lg, borderWidth: 1, borderColor: 'rgba(232,168,56,0.30)', padding: Spacing.md },
  noticeText: { ...Type.small, color: Colors.amber },
  label: { ...Type.label, color: Colors.tx2, marginTop: Spacing.lg, marginBottom: Spacing.xs },
  hint: { ...Type.small, color: Colors.tx2, marginBottom: Spacing.sm },
  input: { backgroundColor: Colors.bg2, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: Spacing.lg, color: Colors.tx0, fontFamily: Type.body.fontFamily, fontSize: 15 },
  mono: { fontFamily: Fonts.mono, fontSize: 12 },
  chips: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: Colors.bg2, borderWidth: 1, borderColor: Colors.border },
  chipOn: { backgroundColor: SharColors.tint, borderColor: SharColors.tintBorder },
  chipText: { ...Type.small, fontFamily: Fonts.sansMedium, color: Colors.tx1 },
  addressBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  address: { fontFamily: Fonts.monoBold, fontSize: 14, color: Colors.tx0 },
  copy: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.sage, textDecorationLine: 'underline' },
  error: { ...Type.small, color: Colors.redAlert, marginTop: Spacing.md },
});
