import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
import { payRouteSwap, startChainPurchase, type PurchaseRequestBody } from '@/lib/chain-swap-client';
import { SWAP_CHAIN_META } from '@/lib/swap-chains';
import { chainLogoByName, tokenLogo } from '@/lib/payment-logos';
import { RoundLogo } from '@/components/dashboard/PaymentMethodPicker';
import { useChatSheet } from '@/lib/chat-context';
import { PayFromPicker } from '@/components/wallet/PayFromPicker';
import { useSolanaPaySource } from '@/lib/wallet-connection';
import { useSuccessAd } from '@/hooks/use-success-ad';
import { EVM_NETWORK_LABEL, friendlyBitrefillError, isManualMethod, payBitrefillInvoice } from '@/lib/payments/bitrefill';
import { friendlyEvmError } from '@/lib/payments/evm-pay';

export interface BitrefillPendingPayment {
  invoiceId: string;
  paymentMethod: string;
  paymentAddress: string;
  paymentAmount: number | string;
  paymentCurrency?: string;
  isTopup?: boolean;
  expiresInMinutes?: number;
  /** paymentMethod 'arc' / 'tempo' only: what to buy. The invoice is created when the person taps Pay (the route is priced live). */
  arcCheckout?: { productId: string; packageId: string; recipientEmail?: string; recipientName?: string; sendTo?: string };
}

type State = 'idle' | 'paying' | 'done' | 'error' | 'manual';

function tokenForMethod(pm: string): string {
  if (pm === 'xrp') return 'XRP';
  if (pm === 'zcash') return 'ZEC';
  if (pm === 'hyperliquid' || pm === 'arc') return 'USDC';
  if (pm === 'tempo') return 'USDC.e';
  if (pm === 'robinhood') return 'ETH';
  if (pm.includes('usdt')) return 'USDT';
  if (pm.includes('usdc')) return 'USDC';
  if (pm === 'bitcoin' || pm === 'lightning') return 'BTC';
  if (pm.includes('litecoin')) return 'LTC';
  if (pm.includes('dogecoin')) return 'DOGE';
  if (pm.includes('dash')) return 'DASH';
  if (pm.includes('ark')) return 'ARK';
  if (pm.includes('ton')) return 'TON';
  if (pm.includes('eth') || pm === 'ethereum') return 'ETH';
  if (pm === 'solana') return 'SOL';
  if (pm.includes('sui')) return 'SUI';
  if (pm.includes('bnb')) return 'BNB';
  if (pm.includes('brc')) return 'BRC';
  return 'token';
}
/**
 * "Confirm Payment" for the assistant's buy_bitrefill_product tool, as on the web: Pay sends the invoice
 * amount from the user's wallet (direct token transfer, or SPL on Solana) and reports back so the assistant
 * can fetch the code. Any token/chain Bitrefill returns without an in-wallet rail is paid manually to a deposit address.
 */
export function BitrefillPaymentCard({ toolCallId, output, onReport }: { toolCallId: string; output: BitrefillPendingPayment; onReport?: (result: Record<string, unknown>) => void }) {
  const call = useApiClient();
  const { getEvmWallet, getSolanaProvider, solanaAddress } = useAuth();
  const { reportToolResult } = useChatSheet();
  // Solana invoices can be paid from Bluvfi's wallet or the wallet the user connected (their choice, shown below).
  const solanaPay = useSolanaPaySource({ address: solanaAddress, getProvider: getSolanaProvider });
  const [state, setState] = useState<State>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const successAd = useSuccessAd();

  const pm = output.paymentMethod ?? 'usdc_base';
  const currency = output.paymentCurrency || tokenForMethod(pm);
  // Arc and Tempo (through bluvfi's swap service): the invoice and route are made when the person taps Pay, then the Bluvfi wallet signs them.
  const isRoute = pm === 'arc' || pm === 'tempo';
  const routeMeta = SWAP_CHAIN_META[pm === 'tempo' ? 'tempo' : 'arc'];
  const [routeStage, setRouteStage] = useState<string | null>(null);

  // In chat the result goes back to the assistant; on the product page the page itself listens (onReport).
  const report = (result: Record<string, unknown>) =>
    onReport ? onReport(result) : reportToolResult({ tool: 'buy_bitrefill_product', toolCallId, output: result });

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const payRoute = async () => {
    if (!output.arcCheckout) throw new Error('Missing checkout details. Ask me to start the purchase again.');
    const wallet = getEvmWallet();
    const chain = pm === 'tempo' ? 'tempo' : 'arc';
    const purchase = await startChainPurchase(call, { ...output.arcCheckout, chain, refundAddress: wallet.address } as PurchaseRequestBody);
    try {
      await payRouteSwap({
        chain,
        payment: purchase.payment,
        refundAddress: purchase.refundAddress,
        reportUrl: `/api/bitrefill/chain-purchase/${encodeURIComponent(purchase.walletRequestId)}/transaction`,
        wallet,
        call,
        onStage: (s) => setRouteStage(s === 'approving' ? `Approving ${routeMeta.symbol}…` : s === 'paying' ? `Paying ${purchase.amount} ${routeMeta.symbol}…` : 'Confirming…'),
      });
    } catch (err) {
      throw new Error(friendlyEvmError(err, routeMeta.label));
    } finally {
      setRouteStage(null);
    }
    setState('done');
    void successAd.show();
    report({
      paid: true,
      invoiceId: purchase.invoiceId,
      paidWith: `${purchase.amount} ${routeMeta.symbol} on ${routeMeta.label}`,
      isTopup: output.isTopup,
      tip: `Paid ${purchase.amount} ${routeMeta.symbol} on ${routeMeta.label} from the user's Bluvfi wallet (it is converted and delivered to Bitrefill, usually within a minute or two). Call poll_bitrefill_order(invoiceId="${purchase.invoiceId}", isTopup=${!!output.isTopup}) now and keep polling until it is complete. Never say swap or bridge.`,
    });
  };

  const handlePay = async () => {
    setState('paying');
    setErrMsg(null);
    successAd.prepare();

    if (isRoute) {
      try {
        await payRoute();
      } catch (err) {
        const friendly = (err as Error)?.message || 'The payment didn’t go through.';
        setErrMsg(friendly);
        setState('error');
        report({ paid: false, error: friendly });
      }
      return;
    }

    // Methods without an in-wallet rail are paid manually: show the exact deposit address to send to.
    if (isManualMethod(pm)) {
      if (!output.paymentAddress) {
        setErrMsg(`No deposit address returned for ${currency}.`);
        setState('error');
        return;
      }
      setState('manual');
      const network = EVM_NETWORK_LABEL[pm] ?? pm.replace(/_/g, ' ');
      report({
        paid: false,
        manualTransferRequired: true,
        depositAddress: output.paymentAddress,
        depositAmount: output.paymentAmount,
        currency,
        network,
        invoiceId: output.invoiceId,
        tip: `${network} ${currency} requires manual transfer. The deposit address has been shown to the user. Ask them to send exactly ${output.paymentAmount} ${currency} to ${output.paymentAddress}, then call poll_bitrefill_order(invoiceId="${output.invoiceId}", isTopup=${!!output.isTopup}) every ~5 s until the status changes.`,
      });
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
      void successAd.show();
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
    const label = output.paymentCurrency || tokenForMethod(pm);
    return (
      <View style={[styles.card, isXrp ? styles.sageCard : styles.warnCard]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <RoundLogo spec={isXrp ? tokenLogo('XRP') : (chainLogoByName(network) ?? tokenLogo(label))} size={20} />
          <Text style={[styles.title, { color: isXrp ? Colors.sageLight : Colors.amber, flexShrink: 1 }]}>
            {isXrp ? 'Send XRP to pay' : `Send manually — ${network} ${label}`}
          </Text>
        </View>
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
        <Button
          fullWidth
          onPress={() => {
            setState('done');
            report({
              paid: true,
              invoiceId: output.invoiceId,
              isTopup: output.isTopup,
              tip: `${label} sent on ${network} — call poll_bitrefill_order(invoiceId="${output.invoiceId}", isTopup=${!!output.isTopup}) now and keep polling until complete.`,
            });
          }}
        >
          {isXrp ? "I've sent the XRP" : "I've sent it"}
        </Button>
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
        <Text style={styles.sub}>{isRoute ? 'Pay with' : 'Amount'}</Text>
        <Text style={styles.amount}>{isRoute ? `${routeMeta.symbol} on ${routeMeta.label}` : `${output.paymentAmount} ${currency}`}</Text>
      </View>
      {isRoute ? <Text style={styles.tiny}>{routeStage ?? `Priced live when you tap Pay (a little above the item price to cover conversion). ${routeMeta.howToPay}`}</Text> : null}
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
            {isRoute ? `Pay with ${routeMeta.symbol} on ${routeMeta.label}` : `Pay ${output.paymentAmount} ${currency}`}
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
