import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCodeStyled from 'react-native-qrcode-styled';
import { Button } from '@/components/ui/Button';
import { PayFromWallet, markSentFromWallet } from './PayFromWallet';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { useChatSheet } from '@/lib/chat-context';
import { PayFromPicker } from '@/components/wallet/PayFromPicker';
import { useSolanaPaySource } from '@/lib/wallet-connection';
import { sendFromWallet, walletRailFor } from '@/lib/payments/wallet-send';
import {
  GaslessUnavailableError,
  RAIL_LABEL,
  createPartnerOrder,
  fetchCryptorefillsOrder,
  fetchPartnerOrder,
  friendlyPayError,
  payCryptorefillsOrder,
  pollCryptorefillsOrder,
  pollPartnerOrder,
  validatePartnerOrder,
  type CrPayStep,
} from '@/lib/cryptorefills-client';
import type {
  CrDelivery,
  CrOrderRequest,
  CrOrderStatus,
  CrPartnerOrder,
  CrPartnerRequest,
  CrPartnerStatus,
  CrRail,
} from '@/lib/cryptorefills-types';

/**
 * Payment card for the assistant's buy_cryptorefills_product tool: the same three ways to pay as the web.
 * Nothing is created upstream until the user taps Confirm.
 *
 *   payWith base/solana: runs the gasless x402 checkout and shows the code.
 *   payWith other:       creates a deposit-address order and shows where to send.
 *
 * It reports {paid, orderId, …} back to the chat. Once reported, the output carries `paid`, so a re-render
 * shows the order instead of offering to pay again.
 */

type Output = {
  pendingCryptorefillsPayment: true;
  productName: string;
  priceUsd: number;
  recipient: string;
  kind?: string;
  logoUrl?: string;
  logoBg?: string;
  payWith?: CrRail | 'other';
  rail?: CrRail;
  order?: CrOrderRequest;
  partnerOrder?: CrPartnerRequest;
  /** The same purchase as a USDC deposit-address order, used if the gasless checkout is unavailable. */
  fallbackPartnerOrder?: CrPartnerRequest;
  // Set after the card reports back:
  paid?: boolean;
  orderId?: string;
  deposit?: CrPartnerOrder;
  error?: string;
};

type State = 'idle' | CrPayStep | 'confirmPrice' | 'polling' | 'deposit' | 'done' | 'error';

const usd = (n: number) => `$${n.toFixed(2)}`;

export function CryptorefillsPaymentCard({ toolCallId, output }: { toolCallId: string; output: Output }) {
  const { getAccessToken, getEvmProvider, getEvmWallet, getSolanaProvider, evmAddress, solanaAddress } = useAuth();
  const { reportToolResult } = useChatSheet();
  // Solana payments can come from Bluvfi's wallet or the wallet the user connected (their choice, shown below).
  const solanaPay = useSolanaPaySource({ address: solanaAddress, getProvider: getSolanaProvider });
  const queryClient = useQueryClient();
  const payWith = output.payWith ?? output.rail ?? 'base';
  const isOther = payWith === 'other';
  const email = output.order?.email ?? output.partnerOrder?.email ?? '';

  const [state, setState] = useState<State>(
    output.paid ? (isOther && output.deposit ? 'deposit' : 'polling') : output.paid === false ? 'error' : 'idle',
  );
  const [note, setNote] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(output.paid === false ? output.error ?? "Payment didn't complete." : null);
  const [order, setOrder] = useState<CrOrderStatus | null>(null);
  const [deposit, setDeposit] = useState<CrPartnerOrder | null>(output.deposit ?? null);
  const [depositState, setDepositState] = useState('awaiting_payment');
  const [priceConfirm, setPriceConfirm] = useState<{ amount: number; resolve: (ok: boolean) => void } | null>(null);
  const abort = useRef(new AbortController());

  useEffect(() => {
    const controller = abort.current;
    return () => controller.abort();
  }, []);

  const refetchPayments = () => queryClient.invalidateQueries({ queryKey: ['payments'] });
  const report = (result: Record<string, unknown>) =>
    reportToolResult({ tool: 'buy_cryptorefills_product', toolCallId, output: { ...output, ...result } });

  const finish = (o: CrOrderStatus) => {
    setOrder(o);
    refetchPayments();
    if (o.status === 'completed') setState('done');
    else {
      setState('error');
      setMsg(
        o.status === 'processing'
          ? `Still processing. The code will arrive by email (order ${o.order_id}).`
          : `The order ${o.status}. Cryptorefills refunds automatically; contact support@cryptorefills.com with order ${o.order_id}.`,
      );
    }
  };

  const finishDeposit = (o: CrPartnerStatus | null) => {
    if (!o) return;
    refetchPayments();
    if (o.status === 'completed') {
      finish({ order_id: o.order_id, status: 'completed', deliveries: o.deliveries });
    } else if (o.status === 'failed' || o.status === 'expired') {
      setState('error');
      setMsg(
        o.status === 'expired'
          ? 'The payment window closed. If you already sent funds, email support@cryptorefills.com with your transaction hash.'
          : `The order didn't complete. Contact support@cryptorefills.com with order ${o.order_id}.`,
      );
    }
  };

  const watchDeposit = (orderId: string) =>
    pollPartnerOrder(orderId, getAccessToken, { onUpdate: (o) => setDepositState(o.status), signal: abort.current.signal }).then((o) => {
      if (!abort.current.signal.aborted) finishDeposit(o);
    });

  // Already reported in an earlier render: resume the order instead of offering to pay again.
  useEffect(() => {
    if (!output.paid || !output.orderId) return;
    const orderId = output.orderId;
    if (isOther) {
      fetchPartnerOrder(orderId, getAccessToken)
        .then((r) => {
          if (!r.data.order) return;
          setDepositState(r.data.order.status);
          if (['completed', 'failed', 'expired'].includes(r.data.order.status)) finishDeposit(r.data.order);
          else void watchDeposit(orderId);
        })
        .catch(() => {});
      return;
    }
    fetchCryptorefillsOrder(orderId, getAccessToken)
      .then((r) => {
        if (r.data.order) finish(r.data.order);
        else {
          setState('error');
          setMsg(r.data.error ?? "Couldn't load the order.");
        }
      })
      .catch(() => {
        setState('error');
        setMsg("Couldn't load the order. The code was emailed to you.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output.paid, output.orderId]);

  const confirmOther = async () => {
    if (!output.partnerOrder) throw new Error('Missing order details. Ask the assistant again.');
    setState('quoting');
    await validatePartnerOrder(output.partnerOrder, getAccessToken);
    const created = await createPartnerOrder(output.partnerOrder, output.priceUsd, output.productName, getAccessToken);
    setDeposit(created);
    setState('deposit');
    refetchPayments();
    // Include the deposit details so a re-render can show them again.
    report({ paid: true, orderId: created.order_id, status: 'awaiting_payment', deposit: created });
    await watchDeposit(created.order_id);
  };

  const confirmGasless = async (rail: CrRail) => {
    if (!output.order) throw new Error('Missing order details. Ask the assistant again.');
    const receipt = await payCryptorefillsOrder({
      order: output.order,
      productName: output.productName,
      expectedUsd: output.priceUsd,
      rail,
      evm: evmAddress ? { provider: await getEvmProvider(), address: evmAddress } : undefined,
      solana: rail === 'solana' && solanaPay.address ? { provider: await solanaPay.getProvider(), address: solanaPay.address } : undefined,
      getAccessToken,
      onStep: setState,
      confirmPriceChange: (amount) =>
        new Promise<boolean>((resolve) => {
          setPriceConfirm({
            amount,
            resolve: (ok) => {
              setPriceConfirm(null);
              resolve(ok);
            },
          });
          setState('confirmPrice');
        }),
    });
    if (!receipt) {
      setState('error');
      setMsg('You declined the new price. Nothing was charged.');
      report({ paid: false, error: 'User declined a price change. Nothing was charged.' });
      return;
    }
    // Report as soon as money has moved, before waiting on delivery.
    report({ paid: true, orderId: receipt.order_id, status: receipt.status });
    if (receipt.status !== 'processing') {
      finish(receipt);
      return;
    }
    setState('polling');
    setOrder(receipt);
    const final = await pollCryptorefillsOrder(receipt.order_id, getAccessToken, { onUpdate: setOrder, signal: abort.current.signal });
    if (!abort.current.signal.aborted) finish(final ?? receipt);
  };

  /**
   * The gasless checkout is down (nothing was charged): pay the same order as a USDC deposit-address order
   * from the wallet, which runs the shared payment layers (Bluvfi's gasless relay, then the user's own gas,
   * then Circle's send).
   */
  const confirmFallback = async (req: CrPartnerRequest) => {
    setNote('The gasless checkout is unavailable right now, so this is being paid from your wallet instead.');
    setState('quoting');
    await validatePartnerOrder(req, getAccessToken);
    const created = await createPartnerOrder(req, output.priceUsd, output.productName, getAccessToken);
    setDeposit(created);
    setState('deposit');
    refetchPayments();
    // From here on it is a deposit-address order, so a re-render resumes it as one.
    report({ paid: true, orderId: created.order_id, status: 'awaiting_payment', deposit: created, payWith: 'other', partnerOrder: req });

    // Pay it from the wallet right away when the amount is what the user agreed to.
    const rail = created.coin && created.network ? walletRailFor(created.coin, created.network) : null;
    const withinPrice = Number(created.coin_amount) <= output.priceUsd * 1.03 + 0.1;
    if (rail && withinPrice && created.wallet_address && created.coin_amount && !created.memo) {
      try {
        const hash = await sendFromWallet({
          rail,
          coin: created.coin!,
          to: created.wallet_address,
          amount: created.coin_amount,
          evmWallet: getEvmWallet,
          solana: solanaPay.address ? { address: solanaPay.address, getProvider: solanaPay.getProvider } : undefined,
        });
        markSentFromWallet('cr_' + created.order_id, hash);
      } catch (e) {
        // The order exists and shows its address and a "Pay from my wallet" button to try again.
        setMsg(friendlyPayError(e));
      }
    }
    await watchDeposit(created.order_id);
  };

  const confirm = async () => {
    setMsg(null);
    setNote(null);
    try {
      try {
        if (payWith === 'other') await confirmOther();
        else await confirmGasless(payWith);
      } catch (e) {
        if (e instanceof GaslessUnavailableError && payWith !== 'other' && output.fallbackPartnerOrder) {
          await confirmFallback(output.fallbackPartnerOrder);
          return;
        }
        throw e;
      }
    } catch (e) {
      const m = friendlyPayError(e);
      setState('error');
      setMsg(m);
      report({ paid: false, error: m });
    }
  };

  const busy = state === 'quoting' || state === 'signing' || state === 'settling' || state === 'polling';
  const payLabel =
    payWith === 'other'
      ? `${output.partnerOrder?.coin ?? ''} · ${output.partnerOrder?.network ?? ''}`
      : `USDC · ${RAIL_LABEL[payWith]} · no gas`;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {output.productName}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            To {output.recipient} · Cryptorefills
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.price}>{usd(output.priceUsd)}</Text>
          <Text style={styles.tiny}>{payLabel}</Text>
        </View>
      </View>

      {state === 'idle' && payWith === 'solana' && <PayFromPicker needed={output.priceUsd} />}

      {state === 'idle' && (
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button
              variant="outline"
              fullWidth
              onPress={() => {
                setState('error');
                setMsg('Cancelled. Nothing was charged.');
                report({ paid: false, error: 'Cancelled by user' });
              }}
            >
              Cancel
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" fullWidth onPress={confirm}>
              {isOther ? 'Get payment address' : 'Confirm & pay'}
            </Button>
          </View>
        </View>
      )}

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color={Colors.sage} />
          <Text style={styles.sub}>
            {state === 'quoting'
              ? isOther
                ? 'Getting your payment address…'
                : 'Creating your order…'
              : state === 'signing'
                ? 'Approving the payment…'
                : state === 'settling'
                  ? `Settling USDC on ${RAIL_LABEL[payWith === 'solana' ? 'solana' : 'base']}…`
                  : `Paid. Waiting for delivery…${order ? ` (${order.order_id})` : ''}`}
          </Text>
        </View>
      )}

      {state === 'confirmPrice' && priceConfirm && (
        <View style={{ gap: Spacing.sm }}>
          <Text style={styles.body}>The price changed to {usd(priceConfirm.amount)}. Pay the new price?</Text>
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button variant="outline" fullWidth onPress={() => priceConfirm.resolve(false)}>
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" fullWidth onPress={() => priceConfirm.resolve(true)}>
                {`Pay ${usd(priceConfirm.amount)}`}
              </Button>
            </View>
          </View>
        </View>
      )}

      {state === 'deposit' && deposit && <DepositPanel order={deposit} state={depositState} />}
      {note ? <Text style={styles.sub}>{note}</Text> : null}
      {msg ? <Text style={styles.error}>{msg}</Text> : null}
      {state === 'done' && order && <Delivered order={order} email={email} />}
    </View>
  );
}

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1500);
  };
  return { copied, copy };
}

/** Where and how much to send for a deposit-address order, with live status. */
function DepositPanel({ order, state }: { order: CrPartnerOrder; state: string }) {
  const { copied, copy } = useCopied();
  const expires = order.expires_at ? new Date(order.expires_at) : null;
  const status =
    state === 'paid'
      ? 'Payment received. Preparing your order…'
      : state === 'review'
        ? 'Cryptorefills is reviewing this order. This can take up to 24 hours.'
        : 'Waiting for your payment…';
  const qr = order.qr_text || order.wallet_address || '';

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={{ alignItems: 'center' }}>
        <Text style={styles.sub}>Send exactly</Text>
        <Pressable onPress={() => copy(order.coin_amount ?? '')}>
          <Text style={styles.sendAmount}>
            {copied === order.coin_amount ? 'Copied' : `${order.coin_amount} ${order.coin ?? ''}`}
          </Text>
        </Pressable>
        <Text style={styles.warn}>on {order.network} only</Text>
      </View>

      {qr ? (
        <View style={styles.qr}>
          <QRCodeStyled data={qr} size={168} padding={8} color="#000000" style={{ backgroundColor: "#FFFFFF" }} />
        </View>
      ) : null}

      <Pressable onPress={() => copy(order.wallet_address ?? '')} style={styles.box}>
        <Text style={styles.sub}>To address · tap to copy</Text>
        <Text style={styles.mono} selectable>
          {copied === order.wallet_address ? 'Copied' : order.wallet_address}
        </Text>
      </Pressable>

      {order.memo ? (
        <Pressable onPress={() => copy(order.memo!)} style={[styles.box, styles.memoBox]}>
          <Text style={styles.warn}>Memo / tag (required)</Text>
          <Text style={styles.mono}>{copied === order.memo ? 'Copied' : order.memo}</Text>
        </Pressable>
      ) : null}

      {state === 'awaiting_payment' && !order.memo && (
        <PayFromWallet
          coin={order.coin ?? ''}
          network={order.network ?? ''}
          address={order.wallet_address}
          amount={order.coin_amount}
          orderKey={`cr_${order.order_id}`}
          sentLabel="Sent from your wallet ✓ — waiting for Cryptorefills to confirm it."
        />
      )}

      <View style={styles.busyRow}>
        {state !== 'review' && <ActivityIndicator size="small" color={Colors.sage} />}
        <Text style={styles.sub}>{status}</Text>
      </View>

      <Text style={[styles.tiny, { textAlign: 'center' }]}>
        Sending a different amount, coin or network can delay or lose the payment.
        {expires ? ` Pay before ${expires.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : ''} You can close this — the
        code is emailed once paid. Order {order.order_id}
      </Text>
    </View>
  );
}

function Delivered({ order, email }: { order: CrOrderStatus; email: string }) {
  const { copied, copy } = useCopied();
  const deliveries: CrDelivery[] = order.deliveries ?? [];
  return (
    <View style={{ gap: Spacing.md }}>
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 32 }}>✅</Text>
        <Text style={styles.title}>Delivered</Text>
        <Text style={[styles.tiny, { textAlign: 'center' }]}>
          A copy was sent to {email}. Order {order.order_id}
        </Text>
      </View>
      {deliveries.map((d, i) => (
        <View key={i} style={styles.box}>
          <Text style={styles.title}>{d.product_name ?? d.brand_name}</Text>
          {(
            [
              ['Code', d.voucher_code],
              ['PIN', d.pin_serial],
              ['Security code', d.security_code],
            ] as const
          ).map(([label, value]) =>
            value ? (
              <Pressable key={label} onPress={() => copy(value)} style={styles.codeRow}>
                <Text style={styles.sub}>{label}</Text>
                <Text style={styles.mono}>{copied === value ? 'Copied' : value}</Text>
              </Pressable>
            ) : null,
          )}
          {d.url ? (
            <Pressable onPress={() => Linking.openURL(d.url!)}>
              <Text style={styles.link}>Open redemption link</Text>
            </Pressable>
          ) : null}
          {d.redeem_instructions ? <Text style={styles.sub}>{d.redeem_instructions}</Text> : null}
          {!d.voucher_code && !d.url && d.delivery_type !== 'inline' ? (
            <Text style={styles.sub}>Delivered {d.delivery_type === 'by_sms' ? 'by SMS' : 'by email'}.</Text>
          ) : null}
        </View>
      ))}
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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  title: { ...Type.h3, color: Colors.tx0 },
  sub: { ...Type.small, color: Colors.tx1 },
  body: { ...Type.body, color: Colors.tx0 },
  tiny: { ...Type.small, fontSize: 11, color: Colors.tx1 },
  price: { ...Type.h3, fontFamily: Fonts.sansBold, color: Colors.tx0 },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  error: { ...Type.small, color: Colors.redAlert },
  warn: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.amber },
  sendAmount: { ...Type.h1, color: Colors.tx0, marginTop: 2 },
  qr: { alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: Radii.xl, overflow: 'hidden' },
  box: { backgroundColor: Colors.bg0, borderRadius: Radii.lg, padding: Spacing.md, gap: 6 },
  memoBox: { borderWidth: 1, borderColor: 'rgba(232,168,56,0.4)' },
  mono: { ...Type.small, fontFamily: Fonts.mono, color: Colors.tx0 },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(242,240,232,0.04)',
    borderRadius: Radii.md,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
  },
  link: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline' },
});
