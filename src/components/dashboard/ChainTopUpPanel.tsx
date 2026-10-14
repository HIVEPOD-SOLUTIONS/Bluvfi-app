import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
import {
  baseBalance,
  chainTopUpStatus,
  payDepositFromWallet,
  payRouteSwap,
  startChainTopUp,
  topUpPlan,
  walletSwapBalance,
  type TopUpPurpose,
  type TopUpResult,
  type TopUpToken,
} from '@/lib/chain-swap-client';
import { chainLogo, tokenLogo } from '@/lib/payment-logos';
import type { ChainKey } from '@/lib/payment-methods';
import { friendlyEvmError } from '@/lib/payments/evm-pay';
import { MIN_DEPOSIT_SWAP_USD, SWAP_CHAIN_META, TOPUP_SWAP_CHAINS, type SwapChain } from '@/lib/swap-chains';
import { DepositPanel } from './DepositPanel';
import { LogoChip, TokenChainLogo } from './PaymentMethodPicker';
import { Field } from './ProductParts';

type Stage = 'pick' | 'starting' | 'signing' | 'deposit' | 'arriving' | 'done' | 'error';

/**
 * "Pay from another chain": tops up the Bluvfi wallet on Base with exactly what a checkout is short of (it reads the Base balance first),
 * from Arc, Tempo, Robinhood Chain, Zcash or Hyperliquid (server: /api/chain-topup, which bluvfi's swap service fulfils). When the funds have
 * arrived it calls onFunded() and the provider's normal wallet payment carries on. Used by Cryptorefills, Backpack stocks and Doma Base
 * listings, on screen and in chat. Mirrors the website's chain-topup-panel.tsx.
 *
 * Arc and Tempo are signed by the Bluvfi wallet; Robinhood Chain, Zcash and Hyperliquid show an address to pay (Robinhood Chain ETH can also be
 * sent from the Bluvfi wallet). A failed or expired payment is refunded by the swap service to the refund address.
 */
export function ChainTopUpPanel({
  token,
  amount,
  amountUsd,
  purpose,
  onFunded,
  initialChain,
  initialRefundAddress,
  title = 'Pay from another chain',
  reference,
  inChat = false,
}: {
  token: TopUpToken;
  /** Total decimal amount of `token` the checkout needs on Base (only the shortfall is topped up). */
  amount: string;
  /** USD value of `amount`. */
  amountUsd: number;
  purpose: TopUpPurpose;
  onFunded: () => void;
  initialChain?: SwapChain;
  initialRefundAddress?: string;
  title?: string;
  /** What this pays for (product, stock, domain): stored with the top-up for tracing. */
  reference?: string;
  /** True in the assistant's chat, which is a plain modal: the refund address uses a normal text input there, not the bottom sheet's. */
  inChat?: boolean;
}) {
  const call = useApiClient();
  const { getEvmWallet } = useAuth();
  const [chain, setChain] = useState<SwapChain>(initialChain ?? 'arc');
  const [refund, setRefund] = useState(initialRefundAddress ?? '');
  const [stage, setStage] = useState<Stage>('pick');
  const [label, setLabel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [topUp, setTopUp] = useState<TopUpResult | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [onBase, setOnBase] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const fundedRef = useRef(false);

  const meta = SWAP_CHAIN_META[chain];
  const symbol = token === 'eth' ? 'ETH' : 'USDC';
  const refundOk = !meta.needsRefundAddress || meta.refundPattern.test(refund.trim());
  const address = useMemo(() => {
    try {
      return getEvmWallet().address;
    } catch {
      return null;
    }
  }, [getEvmWallet]);

  useEffect(() => {
    if (!address) return;
    let live = true;
    baseBalance(token, address).then((b) => {
      if (live) setOnBase(b);
    });
    return () => {
      live = false;
    };
  }, [token, address, stage]);

  // Only the shortfall, plus a little headroom for price moves; a deposit chain has a minimum, so a small shortfall rounds up to it.
  const plan = useMemo(() => topUpPlan({ need: Number(amount), needUsd: amountUsd, onBase, token, kind: meta.kind, minUsd: MIN_DEPOSIT_SWAP_USD }), [amount, amountUsd, onBase, token, meta.kind]);

  // What the Bluvfi wallet already holds on the chosen chain (Arc, Tempo, Robinhood Chain).
  useEffect(() => {
    setBalance(null);
    if (!address || !meta.wallet) return;
    let live = true;
    walletSwapBalance(chain, address).then((b) => {
      if (live) setBalance(b);
    });
    return () => {
      live = false;
    };
  }, [chain, address, meta.wallet]);

  // Watch the swap until it lands (or fails) once something was paid or shown.
  useEffect(() => {
    if (!topUp || (stage !== 'deposit' && stage !== 'arriving')) return;
    let stop = false;
    const check = async () => {
      try {
        const data = await chainTopUpStatus(call, topUp.walletRequestId);
        if (stop) return;
        if (data.progress === 'processing' && stage === 'deposit') setStage('arriving');
        if (data.progress === 'completed' && !fundedRef.current) {
          fundedRef.current = true;
          setStage('done');
          onFunded();
        }
        if (data.progress === 'failed' || data.progress === 'expired') {
          setStage('error');
          setErr(`${data.progress === 'expired' ? 'The payment window closed.' : 'The top-up couldn’t complete.'} Anything you sent is refunded automatically to ${topUp.refundAddress}.`);
        }
      } catch {
        /* keep watching */
      }
    };
    void check();
    const id = setInterval(check, 6000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [topUp, stage, call, onFunded]);

  const start = async () => {
    setErr(null);
    setStage('starting');
    try {
      const wallet = getEvmWallet();
      const t = await startChainTopUp(call, {
        chain,
        token,
        amount: plan.amount,
        amountUsd: plan.usd,
        recipient: wallet.address,
        refundAddress: meta.needsRefundAddress ? refund.trim() : undefined,
        purpose,
        reference,
      });
      setTopUp(t);
      if (meta.kind === 'route') {
        setStage('signing');
        await payRouteSwap({
          chain,
          payment: t.payment,
          refundAddress: t.refundAddress,
          reportUrl: `/api/chain-topup/${encodeURIComponent(t.walletRequestId)}/transaction`,
          wallet,
          call,
          onStage: (s) => setLabel(s === 'approving' ? `Approving ${meta.symbol}…` : s === 'paying' ? `Paying ${t.amount} ${meta.symbol} on ${meta.label}…` : 'Confirming…'),
        });
        setLabel(null);
        setStage('arriving');
      } else {
        setStage('deposit');
      }
    } catch (e) {
      // Nothing was paid (the quote was refused, or the signature was cancelled or failed): back to the picker; a retry prices a fresh top-up.
      setErr(friendlyEvmError(e, meta.label));
      setTopUp(null);
      setLabel(null);
      setStage('pick');
    }
  };

  const sendFromWallet = async () => {
    if (!topUp?.depositAddress) return;
    setErr(null);
    setSending(true);
    try {
      await payDepositFromWallet({ chain, depositAddress: topUp.depositAddress, amount: topUp.amount, wallet: getEvmWallet(), track: { walletRequestId: topUp.walletRequestId, call } });
      setStage('arriving');
    } catch (e) {
      setErr(friendlyEvmError(e, meta.label));
    } finally {
      setSending(false);
    }
  };

  const logoFor = (c: SwapChain) => <TokenChainLogo token={chainLogo(c as ChainKey)} size={24} />;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{plan.covered ? 'Base wallet covered' : `${plan.amount} ${symbol} → your wallet on Base`}</Text>
      </View>

      {stage === 'pick' && plan.covered ? (
        <View style={{ gap: Spacing.sm }}>
          <Text style={styles.hint}>
            Your Bluvfi wallet on Base already has {onBase?.toLocaleString(undefined, { maximumFractionDigits: 6 })} {symbol}: enough for this.
          </Text>
          <Button
            variant="secondary"
            fullWidth
            onPress={() => {
              fundedRef.current = true;
              onFunded();
            }}
          >
            Continue
          </Button>
        </View>
      ) : null}

      {stage === 'pick' && !plan.covered ? (
        <>
          <View style={styles.chips}>
            {TOPUP_SWAP_CHAINS.map((c) => (
              <LogoChip
                key={c}
                logo={logoFor(c)}
                label={SWAP_CHAIN_META[c].label}
                sub={SWAP_CHAIN_META[c].symbol}
                selected={chain === c}
                onPress={() => {
                  setChain(c);
                  setErr(null);
                }}
              />
            ))}
          </View>
          <Text style={styles.hint}>
            {meta.howToPay}
            {balance !== null ? ` You have ${balance.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${meta.symbol} there.` : ''}
          </Text>
          {meta.needsRefundAddress ? (
            <RefundField
              inChat={inChat}
              label={`Refund address (${meta.label})`}
              value={refund}
              onChangeText={setRefund}
              placeholder={meta.refundPlaceholder}
              hint={`If the payment can’t complete, it is refunded here. Use ${meta.refundHint}.`}
              error={refund.trim() && !refundOk ? `That isn’t ${meta.refundHint}.` : null}
            />
          ) : null}
          {meta.kind === 'deposit' && plan.usd <= MIN_DEPOSIT_SWAP_USD ? <Text style={styles.hint}>Top-ups from {meta.label} start at ${MIN_DEPOSIT_SWAP_USD.toFixed(2)}; anything extra stays in your wallet.</Text> : null}
          <Button variant="secondary" fullWidth disabled={!refundOk || (meta.needsRefundAddress && !refund.trim())} onPress={start}>
            {meta.kind === 'route' ? `Pay with ${meta.symbol} on ${meta.label}` : `Get ${meta.symbol} deposit address`}
          </Button>
        </>
      ) : null}

      {stage === 'starting' || stage === 'signing' ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={Colors.sage} />
          <Text style={styles.hint}>{label ?? (stage === 'starting' ? 'Getting a live price…' : 'Confirm in your wallet…')}</Text>
        </View>
      ) : null}

      {stage === 'deposit' && topUp?.depositAddress ? (
        <DepositPanel
          info={{ address: topUp.depositAddress, amount: topUp.amount, currency: meta.symbol, network: meta.label, memo: topUp.depositMemo }}
          logo={tokenLogo(meta.symbol)}
          status={`Waiting for your payment${topUp.expiresAt ? `. Send before ${new Date(topUp.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}…`}
          action={meta.wallet ? { label: 'Send from my Bluvfi wallet', onPress: sendFromWallet, loading: sending, error: err } : null}
          note={`If it can’t complete, it is refunded to ${topUp.refundAddress}.`}
        />
      ) : null}

      {stage === 'arriving' ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={Colors.sage} />
          <Text style={styles.hint}>
            Payment received. {topUp?.receive.amount} {symbol} is on its way to your wallet on Base (usually a minute or two{chain === 'zcash' ? '; Zcash confirmations can take longer' : ''}).
          </Text>
        </View>
      ) : null}
      {stage === 'done' ? (
        <Text style={styles.ok}>
          ✓ {topUp?.receive.amount} {symbol} arrived on Base. Continuing…
        </Text>
      ) : null}
      {err && stage !== 'deposit' ? <Text style={styles.error}>{err}</Text> : null}
      {stage === 'error' ? (
        <Button
          variant="outline"
          fullWidth
          onPress={() => {
            setStage('pick');
            setTopUp(null);
            setErr(null);
            fundedRef.current = false;
          }}
        >
          Try again
        </Button>
      ) : null}
    </View>
  );
}

/** The refund address box: the bottom sheet's input on a sheet, a plain one in the chat modal (the sheet's only works inside a sheet). */
function RefundField(props: { inChat: boolean; label: string; value: string; onChangeText: (t: string) => void; placeholder?: string; hint?: string; error?: string | null }) {
  if (!props.inChat) return <Field label={props.label} value={props.value} onChangeText={props.onChangeText} placeholder={props.placeholder} hint={props.hint} error={props.error} />;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={Colors.tx2}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, props.error ? { borderColor: Colors.redAlert } : null]}
      />
      {props.error ? <Text style={styles.error}>{props.error}</Text> : props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { ...Type.label, color: Colors.tx2 },
  input: { backgroundColor: Colors.bg1, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, color: Colors.tx0, paddingHorizontal: Spacing.lg, paddingVertical: 12, fontFamily: Fonts.mono, fontSize: 13 },
  card: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  head: { gap: 2 },
  title: { ...Type.h3, color: Colors.tx0 },
  sub: { ...Type.small, color: Colors.tx2 },
  hint: { ...Type.small, color: Colors.tx1, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ok: { ...Type.small, color: Colors.sage },
  error: { ...Type.small, color: Colors.redAlert },
});
