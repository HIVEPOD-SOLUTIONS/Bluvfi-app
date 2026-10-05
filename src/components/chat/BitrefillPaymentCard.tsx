import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useChatSheet } from '@/lib/chat-context';
import { PayFromPicker } from '@/components/wallet/PayFromPicker';
import { useSolanaPaySource } from '@/lib/wallet-connection';
import { EVM_NETWORK_LABEL, friendlyBitrefillError, isManualMethod, payBitrefillInvoice } from '@/lib/payments/bitrefill';

export interface BitrefillPendingPayment {
  invoiceId: string;
  paymentMethod: string;
  paymentAddress: string;
  paymentAmount: number | string;
  paymentCurrency?: string;
  isTopup?: boolean;
  expiresInMinutes?: number;
}

type State = 'idle' | 'paying' | 'done' | 'error' | 'manual';

/**
 * "Confirm Payment" for the assistant's buy_bitrefill_product tool, as on the web: Pay sends the invoice
 * amount from the user's wallet (direct token transfer, or SPL on Solana) and reports back so the assistant
 * can fetch the code. XRP and BSC USDT are paid manually to a deposit address.
 */
export function BitrefillPaymentCard({ toolCallId, output }: { toolCallId: string; output: BitrefillPendingPayment }) {
  const { getEvmWallet, getSolanaProvider, solanaAddress } = useAuth();
  const { reportToolResult } = useChatSheet();
  // Solana invoices can be paid from Bluvfi's wallet or the wallet the user connected (their choice, shown below).
  const solanaPay = useSolanaPaySource({ address: solanaAddress, getProvider: getSolanaProvider });
  const [state, setState] = useState<State>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pm = output.paymentMethod ?? 'usdc_base';
  const currency = output.paymentCurrency || (pm.includes('usdt') ? 'USDT' : 'USDC');

  const report = (result: Record<string, unknown>) =>
    reportToolResult({ tool: 'buy_bitrefill_product', toolCallId, output: result });

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handlePay = async () => {
    setState('paying');
    setErrMsg(null);

    // XRP and BSC USDT aren't paid from this wallet: show the address to send to.
    if (isManualMethod(pm)) {
      if (!output.paymentAddress) {
        setErrMsg(pm === 'xrp' ? 'No XRP payment address returned' : 'No deposit address returned for BSC USDT');
        setState('error');
        return;
      }
      setState('manual');
      if (pm === 'usdt_bsc') {
        // Tell the assistant the user has to send manually; it waits for them before polling.
        report({
          paid: false,
          manualTransferRequired: true,
          depositAddress: output.paymentAddress,
          depositAmount: output.paymentAmount,
          currency: 'USDT',
          network: 'BSC (BEP-20)',
          invoiceId: output.invoiceId,
          tip: `BSC USDT requires manual transfer. The deposit address has been shown to the user. Ask them to send ${output.paymentAmount} USDT (BEP-20) to ${output.paymentAddress}, then call poll_bitrefill_order(invoiceId="${output.invoiceId}", isTopup=${!!output.isTopup}) every ~5 s until the status changes.`,
        });
      }
      return;
    }

    try {
      await payBitrefillInvoice({
        paymentMethod: pm,
        paymentAddress: output.paymentAddress,
        paymentAmount: output.paymentAmount,
        wallet: getEvmWallet,
        getSolanaProvider: solanaPay.getProvider,
        solanaAddress: solanaPay.address,
      });
      setState('done');
      report({
        paid: true,
        invoiceId: output.invoiceId,
        isTopup: output.isTopup,
        tip: `${currency} payment confirmed on-chain. Call poll_bitrefill_order(invoiceId="${output.invoiceId}", isTopup=${!!output.isTopup}) NOW. Keep retrying every ~3 s (up to 20 times) until status is complete/failed/expired. Do not ask the user anything.`,
      });
    } catch (err) {
      console.warn('[bitrefill] payment failed', err);
      const friendly = friendlyBitrefillError(err, pm);
      setErrMsg(friendly);
      setState('error');
      report({ paid: false, error: friendly, invoiceId: output.invoiceId });
    }
  };

  const handleCancel = () => {
    setState('error');
    setErrMsg('Cancelled.');
    report({ paid: false, error: 'Cancelled by user', invoiceId: output.invoiceId });
  };

  if (state === 'manual' && output.paymentAddress) {
    const isXrp = pm === 'xrp';
    const network = EVM_NETWORK_LABEL[pm] ?? pm;
    const label = isXrp ? 'XRP' : pm.includes('usdt') ? 'USDT' : 'USDC';
    return (
      <View style={[styles.card, isXrp ? styles.sageCard : styles.warnCard]}>
        <Text style={[styles.title, { color: isXrp ? Colors.sageLight : Colors.amber }]}>
          {isXrp ? '◎ Send XRP to pay' : `🟡 Send manually — ${network} ${label}`}
        </Text>
        <Text style={styles.sub}>
          Send exactly <Text style={styles.strong}>{output.paymentAmount} {label}</Text>{' '}
          {isXrp ? 'to this XRPL address. The amount includes the address activation reserve.' : `to the address below on the ${network} network.`}
        </Text>
        <Pressable onPress={() => copy(output.paymentAddress)} style={styles.addressBox}>
          <Text style={styles.address} selectable>
            {output.paymentAddress}
          </Text>
          <Text style={styles.copy}>{copied ? 'Copied ✓' : 'Copy'}</Text>
        </Pressable>
        <Text style={styles.tiny}>
          {isXrp
            ? 'Only send XRP on the XRP Ledger. Once sent, tap below so Bluvfi can confirm delivery.'
            : `⚠ Only send on ${network} — sending on another network will result in loss of funds.`}
        </Text>
        {isXrp && (
          <Button
            fullWidth
            onPress={() => {
              setState('done');
              report({
                paid: true,
                invoiceId: output.invoiceId,
                tip: `XRP sent — call poll_bitrefill_order(invoiceId="${output.invoiceId}") now and keep polling until complete.`,
              });
            }}
          >
            I've sent the XRP
          </Button>
        )}
      </View>
    );
  }

  if (state === 'done') {
    return (
      <View style={[styles.card, styles.sageCard]}>
        <Text style={styles.success}>✓ Payment sent — confirming with Bitrefill…</Text>
      </View>
    );
  }

  if (state === 'error' && errMsg === 'Cancelled.') {
    return (
      <View style={styles.card}>
        <Text style={styles.sub}>Payment cancelled.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Confirm Payment</Text>
        {output.expiresInMinutes ? <Text style={styles.tiny}>Expires in {output.expiresInMinutes}m</Text> : null}
      </View>
      <View style={styles.amountRow}>
        <Text style={styles.sub}>Amount</Text>
        <Text style={styles.amount}>
          {output.paymentAmount} {currency}
        </Text>
      </View>
      {pm.includes('solana') ? <PayFromPicker needed={Number(output.paymentAmount)} /> : null}
      {errMsg ? <Text style={styles.error}>{errMsg}</Text> : null}
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button variant="outline" fullWidth onPress={handleCancel} disabled={state === 'paying'}>
            Cancel
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" fullWidth onPress={handlePay} loading={state === 'paying'}>
            {`Pay ${output.paymentAmount} ${currency}`}
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginVertical: 4,
  },
  sageCard: { backgroundColor: 'rgba(143,174,130,0.08)', borderColor: Colors.borderSage },
  warnCard: { backgroundColor: 'rgba(232,168,56,0.08)', borderColor: 'rgba(232,168,56,0.3)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...Type.h3, color: Colors.tx0 },
  sub: { ...Type.small, color: Colors.tx1 },
  strong: { fontFamily: Fonts.monoBold, color: Colors.tx0 },
  tiny: { ...Type.small, fontSize: 11, color: Colors.tx1 },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bg0,
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  amount: { ...Type.body, fontFamily: Fonts.monoBold, color: Colors.tx0 },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  error: { ...Type.small, color: Colors.redAlert },
  success: { ...Type.body, color: Colors.sage },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.bg0,
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  address: { ...Type.small, fontFamily: Fonts.mono, color: Colors.tx0, flex: 1 },
  copy: { ...Type.small, color: Colors.tx1 },
});
