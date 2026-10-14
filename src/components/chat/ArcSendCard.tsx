import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { Hex } from 'viem';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { ARC_USDC, arcChain, arcTxUrl } from '@/lib/arc-chain';
import { useAuth } from '@/lib/auth-context';
import { useChatSheet } from '@/lib/chat-context';
import { chainLogo } from '@/lib/payment-logos';
import { RoundLogo } from '@/components/dashboard/PaymentMethodPicker';
import { friendlyEvmError, payEvmTransfer, waitForEvmTx } from '@/lib/payments/evm-pay';

/**
 * Confirm card for the assistant's send_usdc_arc tool. Sends USDC on Arc from the Bluvfi wallet (USDC is also Arc's gas, so nothing else is
 * needed) through the shared payment layers, records it in History, and reports {sent, txHash} back to the chat. Nothing moves until the person
 * taps Send. Mirrors the website's arc-send-card.tsx.
 */
type Output = {
  arcSend: true;
  recipient: string;
  amount: string;
  note?: string;
  sent?: boolean;
  txHash?: string;
  error?: string;
};

export function ArcSendCard({ toolCallId, output }: { toolCallId: string; output: Output }) {
  const call = useApiClient();
  const { getEvmWallet } = useAuth();
  const { reportToolResult } = useChatSheet();
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>(output.sent === true ? 'done' : output.sent === false ? 'error' : 'idle');
  const [msg, setMsg] = useState<string | null>(output.sent === false ? output.error ?? 'Not sent.' : null);
  const [txHash, setTxHash] = useState<string | undefined>(output.txHash);
  const short = `${output.recipient.slice(0, 6)}…${output.recipient.slice(-4)}`;

  const report = (result: Record<string, unknown>) => reportToolResult({ tool: 'send_usdc_arc', toolCallId, output: { ...output, ...result } });

  const send = async () => {
    setMsg(null);
    setState('sending');
    try {
      const { hash } = await payEvmTransfer({
        chainId: arcChain.id,
        token: ARC_USDC,
        symbol: 'USDC',
        decimals: 6,
        recipient: output.recipient as Hex,
        amount: output.amount,
        wallet: getEvmWallet(),
        label: 'chat/arc-send',
      });
      await waitForEvmTx(arcChain.id, hash);
      setTxHash(hash);
      setState('done');
      call('/api/payments', {
        method: 'POST',
        body: { type: 'transfer', referenceId: hash, description: `Sent ${output.amount} USDC on Arc to ${short}`, amountUsdc: output.amount, status: 'completed', txHash: hash, chain: 'arc' },
      }).catch(() => {});
      report({ sent: true, txHash: hash });
    } catch (err) {
      const friendly = friendlyEvmError(err, 'Arc');
      setMsg(friendly);
      setState('error');
      report({ sent: false, error: friendly });
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <RoundLogo spec={chainLogo('arc')} size={20} />
        <Text style={styles.title}>Send USDC on Arc</Text>
      </View>
      <View style={styles.box}>
        <View style={styles.kv}>
          <Text style={styles.sub}>Amount</Text>
          <Text style={styles.strong}>{output.amount} USDC</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.sub}>To</Text>
          <Text style={styles.mono}>{short}</Text>
        </View>
        {output.note ? <Text style={styles.tiny}>{output.note}</Text> : null}
      </View>
      <Text style={styles.tiny}>USDC also pays Arc’s network fee: nothing else is needed.</Text>
      {msg ? <Text style={styles.error}>{msg}</Text> : null}
      {state === 'done' ? (
        <Text style={styles.ok}>
          ✓ Sent.{' '}
          {txHash ? (
            <Text style={styles.link} onPress={() => Linking.openURL(arcTxUrl(txHash)).catch(() => {})}>
              View transaction ↗
            </Text>
          ) : null}
        </Text>
      ) : (
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button
              variant="outline"
              fullWidth
              disabled={state === 'sending'}
              onPress={() => {
                setState('error');
                setMsg('Cancelled. Nothing was sent.');
                report({ sent: false, error: 'Cancelled by user' });
              }}
            >
              Cancel
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" fullWidth loading={state === 'sending'} onPress={send}>
              {state === 'error' ? 'Try again' : `Send ${output.amount} USDC`}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.xl, padding: Spacing.lg, gap: Spacing.md, marginVertical: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...Type.h3, color: Colors.tx0 },
  box: { backgroundColor: Colors.bg0, borderRadius: Radii.md, padding: Spacing.md, gap: 6 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sub: { ...Type.small, color: Colors.tx1 },
  strong: { fontFamily: Fonts.monoBold, color: Colors.tx0 },
  mono: { ...Type.small, fontFamily: Fonts.mono, color: Colors.tx0 },
  tiny: { ...Type.small, fontSize: 11, color: Colors.tx1 },
  error: { ...Type.small, color: Colors.redAlert },
  ok: { ...Type.small, color: Colors.sage },
  link: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', gap: Spacing.sm },
});
