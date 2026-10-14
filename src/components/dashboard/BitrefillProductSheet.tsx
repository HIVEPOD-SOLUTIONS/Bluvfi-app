import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { BitrefillPaymentCard } from '@/components/chat/BitrefillPaymentCard';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient, useApiQuery } from '@/hooks/use-api';
import { useSuccessAd } from '@/hooks/use-success-ad';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { BitrefillProduct } from '@/lib/api-types';
import { bitrefillLogoCandidates, productEmoji } from '@/lib/bills-logos';
import type { CountryEntry } from '@/lib/bills-countries';
import { priceRange } from '@/lib/bitrefill-catalog';
import { methodLogos } from '@/lib/payment-logos';
import { CHAIN_NAME, defaultMethod, friendlyInvoiceError, methodById, methodSummary, methodsForProduct } from '@/lib/payment-methods';
import { listChainSwaps, payDepositFromWallet, payRouteSwap, startChainPurchase, type PurchaseRequestBody } from '@/lib/chain-swap-client';
import { MIN_DEPOSIT_SWAP_USD, SWAP_CHAIN_META, isSwapChain, type SwapChain } from '@/lib/swap-chains';
import { friendlyEvmError } from '@/lib/payments/evm-pay';
import {
  DEPOSIT_POLL_GIVE_UP_MS,
  DIAL_CODES,
  POLL_EVERY_MS,
  POLL_GIVE_UP_MS,
  acceptedMethodLabels,
  amountProblem,
  chainRequestBody,
  checkoutKind,
  ctaLabel,
  depositFromInvoice,
  emailProblem,
  giftProblem,
  hasFixedPackages,
  htmlToText,
  invoiceOutcome,
  invoiceRequestBody,
  packageLabel,
  packageValueOf,
  pendingFromInvoice,
  phoneProblem,
  priceUsd,
  refillInputProblem,
  toE164,
  usesTypedAmount,
  xrpOrderFrom,
  xrpRequestBody,
  type Amount,
  type CatalogSection,
  type PendingPayment,
  type ProductDetail,
  type XrpOrder,
} from '@/lib/product-checkout';
import { Chip, Field, Section, Stars, SummaryRow, Tag } from './ProductParts';
import { Logo } from './CatalogParts';
import { DepositPanel, type DepositInfo } from './DepositPanel';
import { PaymentMethodPicker } from './PaymentMethodPicker';

type Step = 'detail' | 'details' | 'pick' | 'creating' | 'pay' | 'deposit' | 'waiting' | 'done' | 'failed';

/** Where the order stands while it is being watched: enough to poll it and to explain it. */
interface Tracked {
  invoiceId: string;
  accessToken?: string;
  isTopup: boolean;
}

interface DepositState {
  info: DepositInfo;
  methodId: string;
  /** Set for XRP: pay the swap from the person's Bluvfi XRP wallet. */
  xrp?: XrpOrder;
  /** Set for Zcash, Hyperliquid and Robinhood Chain: the swap behind the address, and where a failed payment is refunded. */
  chain?: { swapId: string; chain: SwapChain; refundAddress: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The product picked in the catalog (the full page is fetched when it opens). */
  product: BitrefillProduct | null;
  section: CatalogSection;
  country: CountryEntry;
  /** Hand the purchase to the assistant instead (bill payments with extra steps). */
  onAskAi: (product: BitrefillProduct) => void;
}

/**
 * A Bitrefill product page and checkout in the app, laid out like the website: the description, how to redeem, accepted payment methods and
 * reviews; then Buy Now / Refill Now / Get Plan opens the purchase. The checkout offers every token and chain Bitrefill accepts for the
 * product, each with its logo:
 *   - USDC / USDT on Base, Ethereum, Polygon, Arbitrum, Optimism or Solana pay from the Bluvfi wallet in one tap;
 *   - every other coin shows its exact deposit address and amount (with a QR) and completes by itself once it is sent;
 *   - XRP is settled through a USDC invoice, and can be paid from the Bluvfi XRP wallet;
 *   - Arc USDC and Tempo USDC.e are signed by the Bluvfi wallet (approve, then pay); Robinhood Chain ETH, Zcash and Hyperliquid USDC show an
 *     address to pay (Robinhood Chain ETH can also be sent from the Bluvfi wallet). All five are settled in USDC behind the scenes.
 * The code, the eSIM link or the airtime confirmation shows here when Bitrefill delivers.
 */
export function BitrefillProductSheet({ open, onClose, product: listed, section, country, onAskAi }: Props) {
  const call = useApiClient();
  const toast = useToast();
  const qc = useQueryClient();
  const successAd = useSuccessAd();
  const { email: accountEmail, getEvmWallet } = useAuth();

  const detail = useApiQuery<ProductDetail>(['bitrefill-product', listed?.id], `/api/bitrefill/products/${encodeURIComponent(listed?.id ?? '')}`, undefined, {
    enabled: open && !!listed,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  // The catalog row first, enriched by the full page when it arrives.
  const product = useMemo<ProductDetail | null>(() => (listed ? ({ ...(listed as unknown as ProductDetail), ...(detail.data ?? {}) } as ProductDetail) : null), [listed, detail.data]);

  const [step, setStep] = useState<Step>('detail');
  const [amount, setAmount] = useState<Amount | null>(null);
  const [custom, setCustom] = useState('');
  const [email, setEmail] = useState(accountEmail ?? '');
  const [phone, setPhone] = useState('');
  const [refill, setRefill] = useState('');
  const [isGift, setIsGift] = useState(false);
  const [giftRecipientName, setGiftRecipientName] = useState('');
  const [giftRecipientEmail, setGiftRecipientEmail] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [method, setMethod] = useState<string>('usdc_base');
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [deposit, setDeposit] = useState<DepositState | null>(null);
  const [xrpBusy, setXrpBusy] = useState(false);
  const [xrpError, setXrpError] = useState<string | null>(null);
  const [chainRefund, setChainRefund] = useState('');
  const [chainStage, setChainStage] = useState<string | null>(null);
  const [chainBusy, setChainBusy] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [waitTitle, setWaitTitle] = useState('Payment sent');
  const [result, setResult] = useState<{ code: string | null; esimLink: string | null; instructions: string | null } | null>(null);
  const stop = useRef(false);
  const polling = useRef<string | null>(null);
  const paidFromWallet = useRef(false);

  // A fresh product starts at its page.
  useEffect(() => {
    if (!open) return;
    stop.current = false;
    polling.current = null;
    paidFromWallet.current = false;
    setStep('detail');
    setAmount(null);
    setCustom('');
    setTried(false);
    setPending(null);
    setDeposit(null);
    setXrpBusy(false);
    setXrpError(null);
    setChainRefund('');
    setChainStage(null);
    setChainBusy(false);
    setChainError(null);
    setMessage(null);
    setWaitTitle('Payment sent');
    setResult(null);
    setRefill('');
    setIsGift(false);
    setGiftRecipientName('');
    setGiftRecipientEmail('');
    setGiftMessage('');
    setPhone(`+${DIAL_CODES[country.code] ?? ''}`);
    setEmail((e) => e || accountEmail || '');
    return () => {
      stop.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, listed?.id]);

  const kind = product ? checkoutKind(product, section) : 'card';
  const typedAmount = product ? usesTypedAmount(product) : false;
  const fixed = product ? hasFixedPackages(product) && !typedAmount : false;

  // Every token and chain this product accepts, grouped as on the website; the selection always stays on one of them.
  const groups = useMemo(() => methodsForProduct(product?.payment_methods), [product?.payment_methods]);
  useEffect(() => {
    const all = groups.flatMap((g) => g.methods);
    if (all.length && !all.some((x) => x.id === method)) setMethod(defaultMethod(groups) ?? all[0].id);
  }, [groups, method]);
  const chosen = methodById(method);

  // Fixed products start on their first denomination.
  useEffect(() => {
    if (product && fixed && !amount && product.packages?.[0]) setAmount({ kind: 'package', pkg: product.packages[0] });
  }, [product, fixed, amount]);

  const currentAmount: Amount | null = fixed ? amount : custom.trim() && Number(custom) > 0 ? { kind: 'custom', value: Number(custom) } : null;
  const usd = product && currentAmount ? priceUsd(product, currentAmount) : null;

  const problems = {
    amount: !product ? null : fixed ? (currentAmount ? null : 'Pick an amount.') : amountProblem(product, Number(custom)),
    email: emailProblem(email),
    phone: kind === 'topup' ? phoneProblem(phone, country.code) : null,
    refill: product && (kind === 'account' || kind === 'username' || kind === 'email') ? refillInputProblem(product, kind, refill) : null,
    gift: giftProblem(isGift, giftRecipientName, giftRecipientEmail),
  };
  const hasDetailsProblem = !!(problems.email || problems.phone || problems.refill || problems.gift);
  const hasProblem = Object.values(problems).some(Boolean);

  /**
   * Watches an order until Bitrefill delivers it (or it fails or the wait runs out). A wallet payment moves on to a "payment sent" screen;
   * a deposit stays on its address screen with the status updating, because the person may still be sending.
   */
  const watch = async (target: Tracked, opts: { stay?: boolean; giveUpMs?: number; swapId?: string } = {}) => {
    if (polling.current === target.invoiceId) return;
    polling.current = target.invoiceId;
    const startedAt = Date.now();
    const giveUpMs = opts.giveUpMs ?? POLL_GIVE_UP_MS;
    if (!opts.stay) {
      setStep('waiting');
      setMessage('Payment sent. Bitrefill is processing the order…');
    } else {
      setMessage('Waiting for your payment…');
    }
    while (!stop.current) {
      try {
        const inv = await call<unknown>(`/api/bitrefill/invoice/${encodeURIComponent(target.invoiceId)}${target.accessToken ? `?token=${encodeURIComponent(target.accessToken)}` : ''}`);
        const out = invoiceOutcome(inv, target.isTopup, !!opts.stay);
        if (out.state === 'done') {
          setResult({ code: out.code, esimLink: out.esimLink, instructions: out.instructions });
          setStep('done');
          void qc.invalidateQueries({ queryKey: ['payments'] });
          void qc.invalidateQueries({ queryKey: ['bitrefill-orders'] });
          // A wallet payment already showed its ad; a deposit shows it now that the order is delivered.
          if (!paidFromWallet.current) void successAd.show();
          return;
        }
        if (out.state === 'failed') {
          setMessage(out.message);
          setStep('failed');
          void qc.invalidateQueries({ queryKey: ['payments'] });
          return;
        }
        setMessage(out.message);
        // A payment from another chain: if its swap failed or expired, say where the money is instead of waiting for the full time.
        if (opts.swapId) {
          const row = (await listChainSwaps(call).catch(() => [])).find((r) => r.id === opts.swapId);
          if (row && (row.status === 'failed' || row.status === 'expired')) {
            setMessage(row.summary);
            setStep('failed');
            void qc.invalidateQueries({ queryKey: ['payments'] });
            return;
          }
          if (row?.status === 'processing') setMessage('Payment received. It is being converted: usually a minute or two.');
        }
      } catch (e) {
        // "Invoice not found" and the like: the order isn't visible yet, not a failure. Keep waiting.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setMessage('Your session expired. The order will still show in your purchase history.');
          setStep('failed');
          return;
        }
      }
      if (Date.now() - startedAt > giveUpMs) {
        setMessage(
          opts.stay
            ? 'Order not confirmed yet. If you sent the payment, it will still complete and appear in your purchase history; if Bitrefill sent a refund notice, your funds return automatically.'
            : 'Still confirming. Your payment went through; the order will appear in your purchase history when Bitrefill finishes.',
        );
        setStep('failed');
        void qc.invalidateQueries({ queryKey: ['payments'] });
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
    }
  };

  const continueToPayment = () => {
    setTried(true);
    if (hasDetailsProblem) return;
    if (product?.range && !custom.trim()) setCustom(String(product.range.min));
    setTried(false);
    setStep('pick');
  };

  const requestInput = () => ({
    product: product as ProductDetail,
    kind,
    amount: currentAmount as Amount,
    method,
    email,
    phoneE164: kind === 'topup' ? toE164(phone, country.code) ?? undefined : undefined,
    refillInput: refill,
    gift: isGift ? { recipientName: giftRecipientName, recipientEmail: giftRecipientEmail, message: giftMessage, theme: 'green' } : null,
  });

  const createOrder = async () => {
    setTried(true);
    if (!product || !currentAmount || hasProblem || !chosen) return;
    setStep('creating');
    setMessage(null);
    try {
      const tracked = (invoiceId: string, accessToken?: string): Tracked => ({ invoiceId, accessToken, isTopup: kind === 'topup' });
      // Deposits and links finish on their own, so the successful-payment ad is loaded now, ready for when the order is delivered.
      if (chosen.rail !== 'wallet') successAd.prepare();

      // Zcash, Hyperliquid, Arc, Tempo and Robinhood Chain aren't Bitrefill methods either: bluvfi's swap service converts what the person
      // pays into the USDC the invoice is settled in. Arc and Tempo are signed by the Bluvfi wallet; the rest show an address to pay.
      if (chosen.rail === 'chain') {
        const chain = chosen.id as SwapChain;
        if (!isSwapChain(chain)) throw new Error('That payment method isn’t available right now.');
        const meta = SWAP_CHAIN_META[chain];
        const fromWallet = meta.kind === 'route' || chain === 'robinhood';
        const wallet = fromWallet ? getEvmWallet() : null;
        // A failed payment is refunded to the Bluvfi wallet where it can hold the coin, otherwise to the address the person gives.
        const refundAddress = wallet ? wallet.address : chainRefund.trim();
        if (!meta.refundPattern.test(refundAddress)) throw new Error(`Enter ${meta.refundHint} so a failed payment can be refunded.`);
        if (meta.kind === 'deposit' && usd !== null && usd < MIN_DEPOSIT_SWAP_USD) {
          throw new Error(`This is too small to pay with ${meta.label}: the minimum is $${MIN_DEPOSIT_SWAP_USD.toFixed(2)}. Pick another method or a larger amount.`);
        }
        const purchase = await startChainPurchase(call, chainRequestBody(requestInput(), refundAddress) as unknown as PurchaseRequestBody);
        const order = tracked(purchase.invoiceId, purchase.invoiceAccessToken);
        paidFromWallet.current = false;
        if (meta.kind === 'route') {
          if (!wallet) throw new Error('Your wallet is still being set up. Try again in a moment.');
          try {
            await payRouteSwap({
              chain,
              payment: purchase.payment,
              refundAddress: purchase.refundAddress,
              reportUrl: `/api/bitrefill/chain-purchase/${encodeURIComponent(purchase.walletRequestId)}/transaction`,
              wallet,
              call,
              onStage: (s) => setChainStage(s === 'approving' ? `Approving ${meta.symbol} on ${meta.label}…` : s === 'paying' ? `Paying ${purchase.amount} ${meta.symbol} on ${meta.label}…` : `Confirming on ${meta.label}…`),
            });
          } catch (e) {
            throw new Error(friendlyEvmError(e, meta.label));
          } finally {
            setChainStage(null);
          }
          setWaitTitle(`Paid on ${meta.label}`);
          void watch(order, { giveUpMs: DEPOSIT_POLL_GIVE_UP_MS, swapId: purchase.walletRequestId });
          return;
        }
        if (!purchase.depositAddress) throw new Error('The deposit address wasn’t returned. Please try again or pick another method.');
        setDeposit({
          methodId: chosen.id,
          chain: { swapId: purchase.walletRequestId, chain, refundAddress: purchase.refundAddress },
          info: { address: purchase.depositAddress, amount: purchase.amount, currency: purchase.symbol, network: meta.label, expiresInMinutes: purchase.expirationMinutes ?? null, memo: purchase.depositMemo },
        });
        setStep('deposit');
        void watch(order, { stay: true, giveUpMs: DEPOSIT_POLL_GIVE_UP_MS, swapId: purchase.walletRequestId });
        return;
      }

      // XRP isn't a Bitrefill method: it has its own endpoint, which settles the invoice in USDC behind the scenes.
      if (chosen.rail === 'xrp') {
        if (isGift) throw new Error('Sending as a gift isn’t available when paying with XRP. Pick another method.');
        const res = await call<unknown>('/api/bitrefill/xrp-purchase', { method: 'POST', body: xrpRequestBody(requestInput()) });
        const order = xrpOrderFrom(res);
        if (!order) throw new Error('The XRP swap address wasn’t returned. Please try again or pick another method.');
        setDeposit({
          methodId: chosen.id,
          xrp: order,
          info: { address: order.address, amount: order.amountXrp, currency: 'XRP', network: CHAIN_NAME.xrpl, expiresInMinutes: order.expiresInMinutes },
        });
        paidFromWallet.current = false;
        setStep('deposit');
        void watch(tracked(order.invoiceId, order.accessToken), { stay: true, giveUpMs: DEPOSIT_POLL_GIVE_UP_MS });
        return;
      }

      const inv = await call<any>('/api/bitrefill/invoice', { method: 'POST', body: invoiceRequestBody(requestInput()) });
      const invoiceId: string = inv?.invoice_id ?? inv?.id ?? '';
      const token: string | undefined = inv?.invoice_access_token ?? undefined;

      if (chosen.rail === 'wallet') {
        const p = pendingFromInvoice(inv, chosen.id, kind === 'topup');
        if (!p) throw new Error('Bitrefill didn’t return payment details for this order. Please try again or pick another method.');
        paidFromWallet.current = true;
        setPending(p);
        setStep('pay');
        return;
      }

      if (chosen.rail === 'link') {
        if (!invoiceId || !inv?.payment_link) throw new Error('Bitrefill didn’t return a checkout link for this method. Please pick another.');
        paidFromWallet.current = false;
        await Linking.openURL(inv.payment_link).catch(() => {});
        setWaitTitle('Finish on Bitrefill');
        setStep('waiting');
        void watch(tracked(invoiceId, token), { stay: true, giveUpMs: DEPOSIT_POLL_GIVE_UP_MS });
        setMessage('Finish the payment on Bitrefill’s page. This updates by itself.');
        return;
      }

      // A deposit address: show the exact amount and address, and watch for the order to complete.
      const dep = depositFromInvoice(inv);
      if (!dep || !invoiceId) throw new Error('Bitrefill didn’t return a deposit address for this method. Please pick another.');
      paidFromWallet.current = false;
      setDeposit({
        methodId: chosen.id,
        info: { address: dep.address, amount: dep.amount, currency: dep.currency || chosen.token, network: CHAIN_NAME[chosen.chain], paymentUri: dep.paymentUri, paymentLink: dep.paymentLink, expiresInMinutes: dep.expiresInMinutes },
      });
      setStep('deposit');
      void watch(tracked(invoiceId, token), { stay: true, giveUpMs: DEPOSIT_POLL_GIVE_UP_MS });
    } catch (e) {
      polling.current = null;
      setChainStage(null);
      setMessage(friendlyInvoiceError(e instanceof ApiError ? e.message : (e as Error)?.message));
      setStep('pick');
    }
  };

  /** Pays the XRP swap from the person's own Bluvfi XRP wallet, as the website's one-tap button does. */
  const payXrpFromWallet = async () => {
    const x = deposit?.xrp;
    if (!x?.sidebarWalletId || !x.swapWalletId) return;
    setXrpBusy(true);
    setXrpError(null);
    try {
      await call('/api/xrpl/transfer', { method: 'POST', body: { sourceWalletRequestId: x.sidebarWalletId, destinationWalletRequestId: x.swapWalletId, amountXrp: x.amountXrp } });
      setMessage('XRP sent. Confirming with Bitrefill…');
    } catch (e) {
      setXrpError((e as Error)?.message || 'The transfer didn’t go through. You can still send the XRP from another wallet.');
    } finally {
      setXrpBusy(false);
    }
  };

  /** Robinhood Chain ETH can be sent from the Bluvfi wallet in one tap, as the website's button does. */
  const payChainFromWallet = async () => {
    const c = deposit?.chain;
    if (!c || !deposit?.info.amount) return;
    setChainBusy(true);
    setChainError(null);
    try {
      await payDepositFromWallet({ chain: c.chain, depositAddress: deposit.info.address, amount: deposit.info.amount, wallet: getEvmWallet(), track: { walletRequestId: c.swapId, call } });
      setMessage('Sent. Waiting for the network to confirm…');
    } catch (e) {
      setChainError(friendlyEvmError(e, SWAP_CHAIN_META[c.chain].label));
    } finally {
      setChainBusy(false);
    }
  };

  const onReport = (r: Record<string, unknown>) => {
    if (r.paid === true && pending) {
      void watch({ invoiceId: pending.invoiceId, accessToken: pending.accessToken, isTopup: pending.isTopup });
    } else if (r.paid === false && r.error === 'Cancelled by user') {
      setPending(null);
      setStep('pick');
    }
  };

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    toast({ variant: 'success', title: `${what} copied` });
  };

  const close = () => {
    stop.current = true;
    onClose();
  };

  const title = step === 'detail' ? 'Product' : step === 'details' ? (kind === 'topup' ? 'Top-up details' : 'Delivery details') : step === 'deposit' ? 'Send payment' : step === 'done' ? 'All done' : 'Checkout';
  const description = htmlToText(product?.descriptions);
  const instructions = htmlToText(product?.instructions);
  const range = product ? priceRange(product as unknown as BitrefillProduct) : null;
  const cur = product?.currency && product.currency !== 'USD' ? product.currency : null;
  const amountInputLabel = product?.range
    ? `Amount (${cur ? `${cur} ${product.range.min}–${cur} ${product.range.max}` : `$${product.range.min}–$${product.range.max}`})`
    : `Amount${cur ? ` (${cur})` : ''}`;
  const selectedAmountLabel = currentAmount?.kind === 'package' ? packageLabel(currentAmount.pkg, product?.currency) : custom.trim() ? (cur ? `${cur} ${custom.trim()}` : `$${custom.trim()}`) : '';
  const paymentLabel = chosen ? methodSummary(chosen) : method.replace(/_/g, ' ');
  const acceptedHint = 'Pay from your Bluvfi wallet in one tap with USDC or USDT on Base, Ethereum, Polygon, Arbitrum, Optimism or Solana. Any other coin shows its exact deposit address and amount, and the order completes by itself once you send it.';

  const aboutSections = (
    <>
      {description ? (
        <Section title="Description">
          <Text style={styles.body}>{description}</Text>
        </Section>
      ) : null}
      {instructions ? (
        <Section title="How to Redeem">
          <Text style={styles.body}>{instructions}</Text>
        </Section>
      ) : null}
      <Section title="Accepted Payment Methods">
        <View style={styles.tags}>
          {acceptedMethodLabels(product).map((l) => (
            <Tag key={l} label={l} />
          ))}
        </View>
        <Text style={styles.hint}>{acceptedHint}</Text>
      </Section>
      {product?.reviews?.length ? (
        <Section title={`Reviews${product.ratings ? ` · ★ ${product.ratings.rating_value.toFixed(1)} (${product.ratings.rating_count})` : ''}`}>
          {product.reviews.slice(0, 5).map((r, i) => (
            <View key={i} style={styles.review}>
              <View style={styles.reviewHead}>
                <Text style={styles.reviewer}>{r.author_name}</Text>
                <Text style={styles.reviewDate}>
                  {'★'.repeat(Math.max(1, Math.round(r.score)))} {r.date}
                </Text>
              </View>
              <Text style={styles.body}>{r.content}</Text>
            </View>
          ))}
        </Section>
      ) : null}
      {product?.termsConditions ? (
        <Section title="Terms & Conditions">
          <Text style={styles.small}>{htmlToText(product.termsConditions)}</Text>
        </Section>
      ) : null}
    </>
  );

  return (
    <BottomSheet open={open} onClose={close} title={title} snapPoints={['92%']} scrollable>
      {!product ? null : (
        <View style={{ gap: Spacing.lg }}>
          {/* Header, on every step */}
          <View style={styles.header}>
            <Logo uris={bitrefillLogoCandidates(product)} emoji={productEmoji(section)} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name} numberOfLines={2}>
                {product.name}
              </Text>
              {product.subtitles ? (
                <Text style={styles.sub} numberOfLines={2}>
                  {product.subtitles}
                </Text>
              ) : null}
              {product.ratings ? <Stars value={product.ratings.rating_value} count={product.ratings.rating_count} /> : null}
            </View>
          </View>

          {step === 'detail' ? (
            <>
              <View style={styles.rangeRow}>
                {range ? <Text style={styles.range}>{range}</Text> : null}
                {product.in_stock === false ? <Text style={styles.stock}>Out of stock</Text> : null}
              </View>
              {detail.isLoading ? (
                <View style={{ gap: 8 }}>
                  {[0.9, 0.7, 0.8].map((w, i) => (
                    <View key={i} style={[styles.skeleton, { width: `${w * 100}%` }]} />
                  ))}
                </View>
              ) : null}
              {description ? (
                <Section title="About" defaultOpen>
                  <Text style={styles.body}>{description}</Text>
                </Section>
              ) : null}
              {instructions ? (
                <Section title="How to Redeem" defaultOpen>
                  <Text style={styles.body}>{instructions}</Text>
                </Section>
              ) : null}
              <Section title="Accepted Payment Methods" defaultOpen>
                <View style={styles.tags}>
                  {acceptedMethodLabels(product).map((l) => (
                    <Tag key={l} label={l} />
                  ))}
                </View>
                <Text style={styles.hint}>{acceptedHint}</Text>
              </Section>
              {product.reviews?.length ? (
                <Section title={`Reviews${product.ratings ? ` · ★ ${product.ratings.rating_value.toFixed(1)} (${product.ratings.rating_count})` : ''}`}>
                  {product.reviews.slice(0, 5).map((r, i) => (
                    <View key={i} style={styles.review}>
                      <View style={styles.reviewHead}>
                        <Text style={styles.reviewer}>{r.author_name}</Text>
                        <Text style={styles.reviewDate}>
                          {'★'.repeat(Math.max(1, Math.round(r.score)))} {r.date}
                        </Text>
                      </View>
                      <Text style={styles.body}>{r.content}</Text>
                    </View>
                  ))}
                </Section>
              ) : null}
              {product.termsConditions ? (
                <Section title="Terms & Conditions">
                  <Text style={styles.small}>{htmlToText(product.termsConditions)}</Text>
                </Section>
              ) : null}
              {product.prepayment ? (
                <View style={styles.note}>
                  <Text style={styles.small}>This is a bill payment with extra steps. The assistant walks you through it.</Text>
                  <Button variant="secondary" fullWidth onPress={() => onAskAi(listed as BitrefillProduct)}>
                    Continue with the assistant
                  </Button>
                </View>
              ) : (
                <Button variant="secondary" fullWidth disabled={product.in_stock === false} onPress={() => setStep('details')}>
                  {ctaLabel(product, section)}
                </Button>
              )}
              <Pressable onPress={() => onAskAi(listed as BitrefillProduct)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'center' }}>
                <Text style={styles.link}>Ask the assistant about this</Text>
              </Pressable>
            </>
          ) : null}

          {step === 'details' ? (
            <>
              <Pressable onPress={() => setStep('detail')} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
                <Text style={styles.link}>‹ Product details</Text>
              </Pressable>

              <View style={{ gap: 4 }}>
                <Text style={styles.cardTitle}>{kind === 'topup' ? 'Top-up details' : kind === 'esim' ? 'Data plan details' : 'Delivery details'}</Text>
                <Text style={styles.hint}>
                  {kind === 'topup'
                    ? 'Enter the mobile number to receive the credit and your email for the order receipt.'
                    : kind === 'esim'
                      ? 'Enter the email where Bitrefill should send the eSIM details.'
                      : 'Enter the email where Bitrefill should send your code and receipt.'}
                </Text>
              </View>

              {kind === 'topup' ? (
                <Field label="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+234 801 234 5678" error={tried ? problems.phone : null} hint={`Must be a ${product.name} number.`} />
              ) : null}
              {kind === 'account' || kind === 'username' || kind === 'email' ? (
                <Field
                  label={product.account_id_name?.trim() || (kind === 'username' ? 'Username' : kind === 'email' ? 'Delivery email' : 'Account ID')}
                  value={refill}
                  onChangeText={setRefill}
                  keyboardType={kind === 'email' ? 'email-address' : 'default'}
                  error={tried ? problems.refill : null}
                />
              ) : null}
              <Field label={kind === 'topup' ? 'Email (receipt)' : 'Email Address'} value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" error={tried ? problems.email : null} hint={kind === 'topup' ? 'The receipt is sent here.' : 'Your receipt, and the code or eSIM, are sent here.'} />

              <Pressable onPress={() => setIsGift((g) => !g)} accessibilityRole="switch" accessibilityState={{ checked: isGift }} style={[styles.giftToggle, isGift && styles.giftToggleOn]}>
                <Text style={styles.giftTitle}>🎁 Send as a Gift</Text>
                <View style={[styles.switchTrack, isGift && styles.switchTrackOn]}>
                  <View style={[styles.switchThumb, isGift && styles.switchThumbOn]} />
                </View>
              </Pressable>
              {isGift ? (
                <View style={styles.giftBox}>
                  <Text style={styles.hint}>Bitrefill will email the gift directly to the recipient.</Text>
                  <Field label="Recipient Name" value={giftRecipientName} onChangeText={setGiftRecipientName} placeholder="e.g. Jane Doe" error={tried && problems.gift?.includes('name') ? problems.gift : null} autoCapitalize="words" />
                  <Field label="Recipient Email" value={giftRecipientEmail} onChangeText={setGiftRecipientEmail} keyboardType="email-address" placeholder="recipient@example.com" error={tried && problems.gift && !problems.gift.includes('name') ? problems.gift : null} />
                  <Field label="Personal Message (optional)" value={giftMessage} onChangeText={setGiftMessage} placeholder="Enjoy this gift" />
                </View>
              ) : null}

              <Button variant="secondary" fullWidth onPress={continueToPayment}>
                Continue →
              </Button>
            </>
          ) : null}

          {step === 'pick' || step === 'creating' ? (
            <>
              <Pressable onPress={() => setStep('details')} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
                <Text style={styles.link}>‹ Delivery details</Text>
              </Pressable>

              <View style={{ gap: 8 }}>
                <Text style={styles.label}>{kind === 'esim' && fixed ? 'DATA PLAN' : fixed ? 'SELECT AMOUNT' : 'AMOUNT'}</Text>
                {fixed ? (
                  <View style={styles.tags}>
                    {product.packages!.map((pkg) => (
                      <Chip
                        key={packageValueOf(pkg)}
                        label={packageLabel(pkg, product.currency)}
                        sub={typeof pkg.price_usd === 'number' && cur ? `$${pkg.price_usd}` : undefined}
                        selected={amount?.kind === 'package' && packageValueOf(amount.pkg) === packageValueOf(pkg)}
                        onPress={() => setAmount({ kind: 'package', pkg })}
                      />
                    ))}
                  </View>
                ) : (
                  <Field label={amountInputLabel} value={custom} onChangeText={setCustom} keyboardType="decimal-pad" placeholder={product.range ? `${product.range.min} – ${product.range.max}` : 'Amount'} error={tried ? problems.amount : null} />
                )}
                {usd !== null ? <Text style={styles.hint}>About ${usd.toFixed(2)}</Text> : null}
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.label}>PAY WITH</Text>
                <PaymentMethodPicker groups={groups} selected={method} onSelect={setMethod} />
                {chosen?.rail === 'chain' && isSwapChain(chosen.id) ? (
                  <>
                    <Text style={styles.hint}>{SWAP_CHAIN_META[chosen.id].howToPay}</Text>
                    {SWAP_CHAIN_META[chosen.id].needsRefundAddress ? (
                      <Field
                        label={`Refund address (${SWAP_CHAIN_META[chosen.id].label})`}
                        value={chainRefund}
                        onChangeText={setChainRefund}
                        placeholder={SWAP_CHAIN_META[chosen.id].refundPlaceholder}
                        hint={`If the payment can’t complete, it is refunded here. Use ${SWAP_CHAIN_META[chosen.id].refundHint}.`}
                        error={tried && chainRefund.trim() && !SWAP_CHAIN_META[chosen.id].refundPattern.test(chainRefund.trim()) ? `That isn’t ${SWAP_CHAIN_META[chosen.id].refundHint}.` : null}
                      />
                    ) : null}
                  </>
                ) : null}
              </View>

              <View style={styles.summaryStack}>
                {kind === 'topup' ? <EditableSummaryRow label="📱 Sending to" value={toE164(phone, country.code) ?? phone} onChange={() => setStep('details')} /> : null}
                {kind === 'account' || kind === 'username' || kind === 'email' ? <EditableSummaryRow label={kind === 'email' ? '📧 Delivery email' : kind === 'username' ? '👤 Username' : '🆔 Account'} value={refill.trim()} onChange={() => setStep('details')} /> : null}
                {isGift ? <EditableSummaryRow label="🎁 Gift to" value={`${giftRecipientName.trim()} · ${giftRecipientEmail.trim()}`} onChange={() => setStep('details')} highlight /> : null}
                <EditableSummaryRow label={isGift ? '✉️ Your receipt' : kind === 'topup' || kind === 'account' || kind === 'username' || kind === 'email' ? '✉️ Receipt to' : '✉️ Code sent to'} value={email.trim()} onChange={() => setStep('details')} />
              </View>

              {message ? <Text style={styles.error}>{message}</Text> : null}
              {step === 'creating' && chainStage ? <Text style={styles.hint}>{chainStage}</Text> : null}
              <Button variant="secondary" fullWidth loading={step === 'creating'} onPress={createOrder}>
                {chosen?.rail === 'chain' && isSwapChain(chosen.id) && SWAP_CHAIN_META[chosen.id].kind === 'deposit'
                  ? `Get ${chosen.token} deposit address · ${CHAIN_NAME[chosen.chain]}`
                  : selectedAmountLabel
                    ? `Pay ${selectedAmountLabel} · ${paymentLabel}`
                    : `Pay · ${paymentLabel}`}
              </Button>

              {description || instructions || product.termsConditions || (product.reviews?.length ?? 0) > 0 ? (
                <View style={styles.checkoutAbout}>
                  <Text style={styles.aboutLabel}>ABOUT</Text>
                  {aboutSections}
                </View>
              ) : null}
            </>
          ) : null}

          {step === 'pay' && pending ? (
            <>
              <View style={styles.card}>
                <SummaryRow label="Product" value={product.name} />
                <SummaryRow label="Amount" value={selectedAmountLabel} />
                <SummaryRow label="Pay with" value={paymentLabel} />
                {kind === 'topup' ? <SummaryRow label="To" value={toE164(phone, country.code) ?? phone} /> : null}
                {kind === 'account' || kind === 'username' || kind === 'email' ? <SummaryRow label="For" value={refill.trim()} /> : null}
                <SummaryRow label="Receipt to" value={email.trim()} />
              </View>
              <BitrefillPaymentCard toolCallId={`product-${pending.invoiceId}`} output={pending} onReport={onReport} />
              <Pressable onPress={() => { setPending(null); setStep('pick'); }} hitSlop={8} style={{ alignSelf: 'center' }}>
                <Text style={styles.link}>Change the order</Text>
              </Pressable>
            </>
          ) : null}

          {step === 'deposit' && deposit ? (
            <>
              <DepositPanel
                info={deposit.info}
                logo={methodLogos(methodById(deposit.methodId) ?? PAYMENT_FALLBACK).main}
                status={message ?? 'Waiting for your payment…'}
                action={
                  deposit.xrp?.sidebarWalletId
                    ? { label: 'Pay from my Bluvfi XRP wallet', onPress: payXrpFromWallet, loading: xrpBusy, error: xrpError }
                    : deposit.chain?.chain === 'robinhood' && deposit.info.amount
                      ? { label: `Send ${deposit.info.amount} ETH from my Bluvfi wallet`, onPress: payChainFromWallet, loading: chainBusy, error: chainError }
                      : null
                }
                note={deposit.chain ? `${SWAP_CHAIN_META[deposit.chain.chain].howToPay} Send exactly the amount shown. If it can’t complete, it is refunded to the address ending ${deposit.chain.refundAddress.slice(-6)}.` : null}
              />
              {deposit.info.paymentLink && !deposit.info.amount ? (
                <Button variant="outline" fullWidth onPress={() => Linking.openURL(deposit.info.paymentLink as string).catch(() => {})}>
                  Open Bitrefill’s page to see the exact amount
                </Button>
              ) : null}
              <Text style={styles.hint}>
                {selectedAmountLabel ? `${selectedAmountLabel} · ` : ''}
                {product.name}. You can close this: the order keeps going and shows in your purchase history.
              </Text>
            </>
          ) : null}

          {step === 'waiting' ? (
            <View style={[styles.card, { alignItems: 'center', gap: Spacing.md }]}>
              <ActivityIndicator color={Colors.sage} />
              <Text style={styles.okTitle}>{waitTitle}</Text>
              <Text style={styles.sub}>{message}</Text>
              <Text style={styles.hint}>You can close this. It also shows in your purchase history when it completes.</Text>
            </View>
          ) : null}

          {step === 'done' && result ? (
            <>
              <View style={[styles.card, styles.okCard]}>
                <Text style={styles.okTitle}>✓ {kind === 'topup' ? 'Airtime sent' : kind === 'esim' ? 'Your eSIM is ready' : 'Your order is ready'}</Text>
                {result.code ? (
                  <>
                    <Text style={styles.label}>YOUR CODE</Text>
                    <Text selectable style={styles.code}>
                      {result.code}
                    </Text>
                    <Button variant="outline" onPress={() => copy(result.code as string, 'Code')}>
                      Copy code
                    </Button>
                  </>
                ) : null}
                {result.esimLink ? (
                  <Button variant="outline" onPress={() => Linking.openURL(result.esimLink as string).catch(() => {})}>
                    Open the eSIM install link
                  </Button>
                ) : null}
                {kind === 'topup' ? <Text style={styles.body}>The airtime is credited straight to the number. A receipt was emailed to you.</Text> : null}
                {!result.code && !result.esimLink && kind !== 'topup' ? <Text style={styles.body}>Check your email: the code is sent to {(isGift ? giftRecipientEmail : email).trim()}.</Text> : null}
                {result.instructions ? <Text style={styles.small}>{htmlToText(result.instructions)}</Text> : null}
              </View>
              <Button variant="outline" fullWidth onPress={close}>
                Done
              </Button>
            </>
          ) : null}

          {step === 'failed' ? (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Not finished yet</Text>
                <Text style={styles.body}>{message}</Text>
              </View>
              <Button variant="outline" fullWidth onPress={close}>
                Close
              </Button>
            </>
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}

/** Used only if a deposit's method id is somehow unknown, so its logo still draws. */
const PAYMENT_FALLBACK = { id: 'x', group: 'Crypto', token: 'USDC', chain: 'ethereum', label: '', rail: 'address' } as const;

function EditableSummaryRow({ label, value, onChange, highlight }: { label: string; value: string; onChange: () => void; highlight?: boolean }) {
  return (
    <View style={[styles.summaryLine, highlight && styles.summaryLineHighlight]}>
      <Text style={styles.summaryLineLabel}>{label}</Text>
      <Text style={[styles.summaryLineValue, highlight && { color: Colors.sage }]} numberOfLines={1}>
        {value}
      </Text>
      <Pressable onPress={onChange} hitSlop={8} accessibilityRole="button">
        <Text style={styles.summaryChange}>Change</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  name: { ...Type.h2, color: Colors.tx0 },
  sub: { ...Type.small, color: Colors.tx1 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  range: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.sage, backgroundColor: 'rgba(143,174,130,0.14)', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12, overflow: 'hidden' },
  stock: { ...Type.small, color: Colors.tx2, backgroundColor: Colors.bg2, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' },
  skeleton: { height: 12, borderRadius: 6, backgroundColor: 'rgba(242,240,232,0.06)' },
  body: { ...Type.body, color: Colors.tx1 },
  small: { ...Type.small, color: Colors.tx1 },
  hint: { ...Type.small, color: Colors.tx2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  review: { gap: 4, paddingTop: Spacing.sm },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  reviewer: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  reviewDate: { ...Type.small, color: Colors.tx2 },
  link: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.sage },
  label: { ...Type.label, color: Colors.tx2 },
  error: { ...Type.small, color: Colors.redAlert },
  note: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  giftToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, backgroundColor: Colors.bg0 },
  giftToggleOn: { borderColor: Colors.borderSage, backgroundColor: 'rgba(143,174,130,0.08)' },
  giftTitle: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  giftBox: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  switchTrack: { width: 38, height: 22, borderRadius: 999, backgroundColor: Colors.bg3, justifyContent: 'center', paddingHorizontal: 3 },
  switchTrackOn: { backgroundColor: Colors.sage },
  switchThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.tx0 },
  switchThumbOn: { alignSelf: 'flex-end', backgroundColor: Colors.bg0 },
  summaryStack: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.sm },
  summaryLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 34 },
  summaryLineHighlight: { borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.borderSage, backgroundColor: 'rgba(143,174,130,0.08)', marginHorizontal: -6, paddingHorizontal: 6 },
  summaryLineLabel: { ...Type.small, color: Colors.tx2 },
  summaryLineValue: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx0, flex: 1 },
  summaryChange: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.sage },
  checkoutAbout: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.lg, gap: Spacing.sm },
  aboutLabel: { ...Type.label, color: Colors.tx2 },
  card: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.sm },
  okCard: { borderColor: Colors.borderSage, backgroundColor: 'rgba(143,174,130,0.08)', gap: Spacing.md },
  okTitle: { ...Type.h3, color: Colors.sage },
  cardTitle: { ...Type.h3, color: Colors.tx0 },
  code: { fontFamily: Fonts.monoBold, fontSize: 20, letterSpacing: 1, color: Colors.tx0 },
});
