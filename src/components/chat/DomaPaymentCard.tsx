import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { createPublicClient, encodeFunctionData, erc20Abi, http, parseAbi, type Hex } from 'viem';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
import { useChatSheet } from '@/lib/chat-context';
import { DOMA_BRIDGE_URL, domaChain } from '@/lib/doma-chain';
import { friendlyEvmError, payEvm, waitForEvmTx } from '@/lib/payments/evm-pay';

/**
 * Pay card for the assistant's doma_create_order tool. Doma returns a signed payment voucher; paying it is
 * on-chain on the Doma chain from the user's own wallet: approve the token (USDC.e) to Doma's payment
 * contract, then pay(voucher, signature) — or a single pay with value for native ETH. Nothing is sent until
 * the user taps Pay. Reports {paid, txHash} back to the chat.
 */

type Step = { step: number; action: 'approve' | 'pay'; contract: string; args: Record<string, unknown>; value?: string };

type Output = {
  domaPayment: true;
  order: { orderId: string; totalPayment: string; items?: { name?: string; domain?: string }[]; voucherExpiresAt?: string };
  payment: { payTo: string | null; token: string; amount: string; steps: Step[] };
  paid?: boolean;
  txHash?: string;
  error?: string;
};

type State = 'idle' | 'checking' | 'approving' | 'paying' | 'done' | 'error';

const PAY_ABI = parseAbi([
  'function pay((address buyer, address token, uint256 amount, uint256 voucherExpiration, string paymentId, string orderId) voucher, bytes signature) payable',
]);

export function DomaPaymentCard({ toolCallId, output }: { toolCallId: string; output: Output }) {
  const call = useApiClient();
  const { getEvmWallet } = useAuth();
  const { reportToolResult } = useChatSheet();
  const [state, setState] = useState<State>(output.paid === true ? 'done' : output.paid === false ? 'error' : 'idle');
  const [msg, setMsg] = useState<string | null>(output.paid === false ? output.error ?? "Payment didn't go through." : null);
  const [txHash, setTxHash] = useState<string | undefined>(output.txHash);

  const native = output.payment.token === 'native';
  const decimals = native ? 18 : 6; // USDC.e has 6 decimals
  const amountAtomic = BigInt(output.payment.amount);
  const display = `${(Number(amountAtomic) / 10 ** decimals).toLocaleString(undefined, { maximumFractionDigits: native ? 6 : 2 })} ${native ? 'ETH' : 'USDC.e'}`;
  const domains = (output.order.items ?? []).map((i) => i.name ?? i.domain).filter(Boolean).join(', ');
  const expired = output.order.voucherExpiresAt ? new Date(output.order.voucherExpiresAt).getTime() < Date.now() : false;

  const report = (result: Record<string, unknown>) =>
    reportToolResult({ tool: 'doma_create_order', toolCallId, output: { ...output, ...result } });

  const pay = async () => {
    setMsg(null);
    try {
      const wallet = getEvmWallet();
      const from = wallet.address as Hex;
      const payStep = output.payment.steps.find((s) => s.action === 'pay');
      if (!payStep || !output.payment.payTo) {
        throw new Error("Doma didn't return a payment contract. Ask the assistant to create the order again.");
      }

      // Pre-flight on the Doma chain: the token balance, and a little ETH for gas.
      setState('checking');
      const pub = createPublicClient({ chain: domaChain, transport: http() });
      const gas = await pub.getBalance({ address: from });
      const tokenBal = native
        ? gas
        : await pub.readContract({ address: output.payment.token as Hex, abi: erc20Abi, functionName: 'balanceOf', args: [from] });
      if (tokenBal < amountAtomic) throw new Error(`You need ${display} on the Doma chain. Bridge funds at ${DOMA_BRIDGE_URL}, then try again.`);

      if (!native) {
        // Skip the approve if an earlier attempt already granted enough.
        const allowance = await pub.readContract({
          address: output.payment.token as Hex,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [from, output.payment.payTo as Hex],
        });
        if (allowance < amountAtomic) {
          setState('approving');
          const { hash: approveHash } = await payEvm({
            payment: {
              chainId: domaChain.id,
              to: output.payment.token as Hex,
              data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [output.payment.payTo as Hex, amountAtomic] }),
            },
            wallet,
            label: 'doma',
          });
          await waitForEvmTx(domaChain.id, approveHash);
        }
      }

      setState('paying');
      const v = payStep.args.voucher as Record<string, string | number>;
      const voucher = {
        buyer: v.buyer as Hex,
        token: v.token as Hex,
        amount: BigInt(v.amount),
        voucherExpiration: BigInt(v.voucherExpiration),
        paymentId: String(v.paymentId),
        orderId: String(v.orderId),
      };
      const { hash } = await payEvm({
        payment: {
          chainId: domaChain.id,
          to: output.payment.payTo as Hex,
          data: encodeFunctionData({ abi: PAY_ABI, functionName: 'pay', args: [voucher, payStep.args.signature as Hex] }),
          ...(native ? { value: amountAtomic } : {}),
        },
        wallet,
        label: 'doma',
      });
      await waitForEvmTx(domaChain.id, hash);
      setTxHash(hash);
      setState('done');
      // History, as the website records it.
      call('/api/payments', {
        method: 'POST',
        body: {
          type: 'domain',
          referenceId: output.order.orderId,
          description: `Doma registration: ${domains || 'domain'} (${display})`,
          amountUsdc: native ? '0' : String(Number(amountAtomic) / 1e6),
          status: 'completed',
          txHash: hash,
          chain: 'doma',
        },
      }).catch(() => {});
      report({ paid: true, txHash: hash });
    } catch (e) {
      let m = friendlyEvmError(e, 'the Doma chain');
      if (/gas/i.test(m)) m += ` Bridge a little ETH at ${DOMA_BRIDGE_URL}, then try again.`;
      setState('error');
      setMsg(m);
      report({ paid: false, error: m });
    }
  };

  const busy = state === 'checking' || state === 'approving' || state === 'paying';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.icon}>
          <Text style={{ fontSize: 18 }}>🌐</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {domains || 'Doma domain order'}
          </Text>
          <Text style={styles.sub}>Doma · order {output.order.orderId.slice(0, 8)}…</Text>
        </View>
        <Text style={styles.amount}>{display}</Text>
      </View>

      {state === 'idle' &&
        (expired ? (
          <Text style={styles.warn}>This payment voucher has expired. Ask the assistant to create the order again.</Text>
        ) : (
          <>
            <Text style={styles.tiny}>
              Paid on the Doma chain from your wallet{native ? '' : ' (approve, then pay)'}. Needs {display} and a little ETH for gas there.
            </Text>
            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Button
                  variant="outline"
                  fullWidth
                  onPress={() => {
                    setState('error');
                    setMsg('Cancelled. Nothing was sent.');
                    report({ paid: false, error: 'Cancelled by user' });
                  }}
                >
                  Cancel
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button variant="secondary" fullWidth onPress={pay}>
                  {`Pay ${display}`}
                </Button>
              </View>
            </View>
          </>
        ))}

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color={Colors.sage} />
          <Text style={styles.sub}>
            {state === 'checking'
              ? 'Checking your Doma balance…'
              : state === 'approving'
                ? 'Approving USDC.e (1 of 2)…'
                : `Sending the payment${native ? '' : ' (2 of 2)'}…`}
          </Text>
        </View>
      )}

      {state === 'done' && (
        <Text style={styles.value}>
          ✅ Paid.{' '}
          {txHash ? (
            <Text style={styles.link} onPress={() => Linking.openURL(`${domaChain.blockExplorers.default.url}/tx/${txHash}`)}>
              View transaction
            </Text>
          ) : null}{' '}
          Registration completes shortly.
        </Text>
      )}

      {state === 'error' && msg ? <Text style={styles.error}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginVertical: 4,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: { width: 40, height: 40, borderRadius: Radii.lg, backgroundColor: 'rgba(242,240,232,0.06)', alignItems: 'center', justifyContent: 'center' },
  title: { ...Type.h3, color: Colors.tx0 },
  sub: { ...Type.small, color: Colors.tx1 },
  tiny: { ...Type.small, fontSize: 11, color: Colors.tx1 },
  amount: { ...Type.h3, fontFamily: Type.amount.fontFamily, color: Colors.tx0 },
  value: { ...Type.small, color: Colors.tx0 },
  link: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline' },
  warn: { ...Type.small, color: Colors.amber },
  error: { ...Type.small, color: Colors.redAlert },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
