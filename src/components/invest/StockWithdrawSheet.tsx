import { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';

const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Sends leftover stock credit back to the user's wallet as USDC on Base. */
export function StockWithdrawSheet({ open, cashUsd, onClose }: { open: boolean; cashUsd: number; onClose: () => void }) {
  const call = useApiClient();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [state, setState] = useState<'form' | 'sending' | 'sent' | 'queued' | 'error'>('form');
  const [msg, setMsg] = useState<string | null>(null);

  const close = () => {
    onClose();
    // Reset once the sheet has gone, so it opens fresh next time.
    setTimeout(() => {
      setState('form');
      setAmount('');
      setMsg(null);
    }, 300);
  };

  const withdraw = async () => {
    setState('sending');
    setMsg(null);
    try {
      const d = await call<{ status?: string }>('/api/stocks/withdraw', { method: 'POST', body: { amount } });
      queryClient.invalidateQueries({ queryKey: ['stocks-portfolio'] });
      setState(d.status === 'queued' ? 'queued' : 'sent');
    } catch (e) {
      setState('error');
      setMsg((e as Error).message || 'Withdrawal failed.');
    }
  };

  const invalid = !(Number(amount) >= 1) || Number(amount) > cashUsd;

  return (
    <BottomSheet open={open} onClose={close} title="Send credit to wallet" snapPoints={['55%']} scrollable>
      <Text style={styles.sub}>{usd(cashUsd)} credit · sent as USDC on Base</Text>

      {state === 'sent' || state === 'queued' ? (
        <View style={styles.center}>
          <Text style={styles.emoji}>{state === 'sent' ? '✅' : '⏳'}</Text>
          <Text style={styles.title}>{state === 'sent' ? 'On its way to your wallet' : 'Withdrawal requested'}</Text>
          <Text style={styles.sub}>
            {state === 'sent' ? 'Usually arrives within a few minutes.' : 'Our team sends it to your Bluvfi wallet, usually within 24 hours.'}
          </Text>
          <View style={{ height: Spacing.lg, alignSelf: 'stretch' }} />
          <Button variant="secondary" fullWidth onPress={close}>
            Done
          </Button>
        </View>
      ) : (
        <View style={{ gap: Spacing.md, marginTop: Spacing.lg }}>
          <View style={styles.row}>
            <View style={styles.inputWrap}>
              <BottomSheetTextInput
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="Amount in USDC"
                placeholderTextColor={Colors.tx2}
                style={styles.input}
              />
            </View>
            <Pressable onPress={() => setAmount((Math.floor(cashUsd * 100) / 100).toFixed(2))} style={styles.max}>
              <Text style={styles.maxText}>Max</Text>
            </Pressable>
          </View>
          {msg ? <Text style={styles.error}>{msg}</Text> : null}
          <Button variant="secondary" fullWidth loading={state === 'sending'} disabled={invalid} onPress={withdraw}>
            Withdraw to my wallet
          </Button>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sub: { ...Type.small, color: Colors.tx1 },
  center: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  emoji: { fontSize: 36 },
  title: { ...Type.h3, color: Colors.tx0, textAlign: 'center' },
  error: { ...Type.small, color: Colors.redAlert },
  row: { flexDirection: 'row', gap: Spacing.sm },
  inputWrap: {
    flex: 1,
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.lg,
  },
  input: { ...Type.body, color: Colors.tx0, paddingVertical: 14 },
  max: { backgroundColor: Colors.bg2, borderRadius: Radii.xl, paddingHorizontal: Spacing.lg, justifyContent: 'center' },
  maxText: { ...Type.small, color: Colors.tx0 },
});
