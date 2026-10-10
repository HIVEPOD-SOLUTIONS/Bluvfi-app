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
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { BitrefillProduct } from '@/lib/api-types';
import { bitrefillLogoCandidates, productEmoji } from '@/lib/bills-logos';
import type { CountryEntry } from '@/lib/bills-countries';
import { priceRange } from '@/lib/bitrefill-catalog';
import {
  DIAL_CODES,
  POLL_EVERY_MS,
  POLL_GIVE_UP_MS,
  WALLET_METHODS,
  acceptedMethodLabels,
  acceptsWalletMethod,
  amountProblem,
  checkoutKind,
  ctaLabel,
  emailProblem,
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
  type Amount,
  type CatalogSection,
  type PendingPayment,
  type ProductDetail,
} from '@/lib/product-checkout';
import { Chip, Field, Section, Stars, SummaryRow, Tag } from './ProductParts';
import { Logo } from './CatalogParts';

type Step = 'detail' | 'form' | 'creating' | 'pay' | 'waiting' | 'done' | 'failed';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The product picked in the catalog (the full page is fetched when it opens). */
  product: BitrefillProduct | null;
  section: CatalogSection;
  country: CountryEntry;
  /** Hand the purchase to the assistant instead (other ways to pay, bill payments). */
  onAskAi: (product: BitrefillProduct) => void;
}

/**
 * A Bitrefill product page and checkout in the app, as on the website: the description, how to redeem, accepted payment methods and
 * reviews, then Buy Now / Refill Now / Get Plan opens the purchase: amount, who it's for, how to pay. Paying is one tap from the Bluvfi
 * wallet; the code (or the eSIM link, or the airtime confirmation) shows right here when Bitrefill delivers.
 */
export function BitrefillProductSheet({ open, onClose, product: listed, section, country, onAskAi }: Props) {
  const call = useApiClient();
  const toast = useToast();
  const qc = useQueryClient();
  const { email: accountEmail } = useAuth();

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
  const [method, setMethod] = useState<'usdc_base' | 'usdc_solana'>('usdc_base');
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string | null; esimLink: string | null; instructions: string | null } | null>(null);
  const stop = useRef(false);

  // A fresh product starts at its page.
  useEffect(() => {
    if (!open) return;
    stop.current = false;
    setStep('detail');
    setAmount(null);
    setCustom('');
    setTried(false);
    setPending(null);
    setMessage(null);
    setResult(null);
    setRefill('');
    setPhone(`+${DIAL_CODES[country.code] ?? ''}`);
    setEmail((e) => e || accountEmail || '');
    return () => {
      stop.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, listed?.id]);

  const kind = product ? checkoutKind(product, section) : 'card';
  const fixed = product ? hasFixedPackages(product) : false;
  const methods = product ? WALLET_METHODS.filter((m) => acceptsWalletMethod(product, m.id)) : WALLET_METHODS;
  useEffect(() => {
    if (methods.length && !methods.some((m) => m.id === method)) setMethod(methods[0].id);
  }, [methods, method]);

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
  };
  const hasProblem = Object.values(problems).some(Boolean);

  const poll = async (p: PendingPayment) => {
    const startedAt = Date.now();
    setStep('waiting');
    setMessage('Payment sent. Bitrefill is processing the order…');
    while (!stop.current) {
      try {
        const inv = await call<unknown>(`/api/bitrefill/invoice/${encodeURIComponent(p.invoiceId)}${p.accessToken ? `?token=${encodeURIComponent(p.accessToken)}` : ''}`);
        const out = invoiceOutcome(inv, p.isTopup);
        if (out.state === 'done') {
          setResult({ code: out.code, esimLink: out.esimLink, instructions: out.instructions });
          setStep('done');
          void qc.invalidateQueries({ queryKey: ['payments'] });
          void qc.invalidateQueries({ queryKey: ['bitrefill-orders'] });
          return;
        }
        if (out.state === 'failed') {
          setMessage(out.message);
          setStep('failed');
          void qc.invalidateQueries({ queryKey: ['payments'] });
          return;
        }
        setMessage(out.message);
      } catch (e) {
        // "Invoice not found" and the like: the order isn't visible yet, not a failure. Keep waiting.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setMessage('Your session expired. The order will still show in your purchase history.');
          setStep('failed');
          return;
        }
      }
      if (Date.now() - startedAt > POLL_GIVE_UP_MS) {
        setMessage('Still confirming. Your payment went through; the order will appear in your purchase history when Bitrefill finishes.');
        setStep('failed');
        void qc.invalidateQueries({ queryKey: ['payments'] });
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
    }
  };

  const createOrder = async () => {
    setTried(true);
    if (!product || !currentAmount || hasProblem) return;
    setStep('creating');
    setMessage(null);
    try {
      const body = invoiceRequestBody({
        product,
        kind,
        amount: currentAmount,
        method,
        email,
        phoneE164: kind === 'topup' ? toE164(phone, country.code) ?? undefined : undefined,
        refillInput: refill,
      });
      const inv = await call<unknown>('/api/bitrefill/invoice', { method: 'POST', body });
      const p = pendingFromInvoice(inv, method, kind === 'topup');
      if (!p) throw new Error('Bitrefill didn’t return payment details for this order. Please try again.');
      setPending(p);
      setStep('pay');
    } catch (e) {
      setMessage((e as Error)?.message || 'Couldn’t create the order. Please try again.');
      setStep('form');
    }
  };

  const onReport = (r: Record<string, unknown>) => {
    if (r.paid === true && pending) {
      void poll(pending);
    } else if (r.paid === false && r.error === 'Cancelled by user') {
      setPending(null);
      setStep('form');
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

  const title = step === 'detail' ? 'Product' : step === 'done' ? 'All done' : 'Checkout';
  const description = htmlToText(product?.descriptions);
  const instructions = htmlToText(product?.instructions);
  const range = product ? priceRange(product as unknown as BitrefillProduct) : null;

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
                <Text style={styles.hint}>In the app you pay with USDC from your Bluvfi wallet in one tap. For anything else, ask the assistant.</Text>
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
                <Button variant="secondary" fullWidth disabled={product.in_stock === false} onPress={() => setStep('form')}>
                  {ctaLabel(product, section)}
                </Button>
              )}
              <Pressable onPress={() => onAskAi(listed as BitrefillProduct)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'center' }}>
                <Text style={styles.link}>Ask the assistant about this</Text>
              </Pressable>
            </>
          ) : null}

          {step === 'form' || step === 'creating' ? (
            <>
              <Pressable onPress={() => setStep('detail')} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
                <Text style={styles.link}>‹ Product details</Text>
              </Pressable>

              <View style={{ gap: 8 }}>
                <Text style={styles.label}>AMOUNT</Text>
                {fixed ? (
                  <View style={styles.tags}>
                    {product.packages!.map((pkg) => (
                      <Chip
                        key={packageValueOf(pkg)}
                        label={packageLabel(pkg, product.currency)}
                        sub={typeof pkg.price_usd === 'number' && product.currency && product.currency !== 'USD' ? `$${pkg.price_usd}` : undefined}
                        selected={amount?.kind === 'package' && packageValueOf(amount.pkg) === packageValueOf(pkg)}
                        onPress={() => setAmount({ kind: 'package', pkg })}
                      />
                    ))}
                  </View>
                ) : (
                  <Field
                    label={`Amount${product.currency && product.currency !== 'USD' ? ` (${product.currency})` : ''}`}
                    value={custom}
                    onChangeText={setCustom}
                    keyboardType="decimal-pad"
                    placeholder={product.range ? `${product.range.min} – ${product.range.max}` : 'Amount'}
                    error={tried ? problems.amount : null}
                  />
                )}
                {usd !== null ? <Text style={styles.hint}>About ${usd.toFixed(2)} in USDC</Text> : null}
              </View>

              {kind === 'topup' ? (
                <Field label="Phone number to top up" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+234 801 234 5678" error={tried ? problems.phone : null} hint="With the country code, or just the number for your country." />
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
              <Field label="Your email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" error={tried ? problems.email : null} hint={kind === 'topup' ? 'The receipt is sent here.' : 'Your receipt, and the code or eSIM, are sent here.'} />

              <View style={{ gap: 8 }}>
                <Text style={styles.label}>PAY WITH</Text>
                <View style={styles.tags}>
                  {methods.map((m) => (
                    <Chip key={m.id} label={m.label} sub={m.note} selected={method === m.id} onPress={() => setMethod(m.id)} />
                  ))}
                </View>
              </View>

              {message ? <Text style={styles.error}>{message}</Text> : null}
              <Button variant="secondary" fullWidth loading={step === 'creating'} onPress={createOrder}>
                {usd !== null ? `Continue · $${usd.toFixed(2)}` : 'Continue'}
              </Button>
            </>
          ) : null}

          {step === 'pay' && pending ? (
            <>
              <View style={styles.card}>
                <SummaryRow label="Product" value={product.name} />
                <SummaryRow label="Amount" value={currentAmount?.kind === 'package' ? packageLabel(currentAmount.pkg, product.currency) : `${custom}${product.currency && product.currency !== 'USD' ? ` ${product.currency}` : ''}`} />
                {kind === 'topup' ? <SummaryRow label="To" value={toE164(phone, country.code) ?? phone} /> : null}
                {kind === 'account' || kind === 'username' || kind === 'email' ? <SummaryRow label="For" value={refill.trim()} /> : null}
                <SummaryRow label="Receipt to" value={email.trim()} />
              </View>
              <BitrefillPaymentCard toolCallId={`product-${pending.invoiceId}`} output={pending} onReport={onReport} />
              <Pressable onPress={() => { setPending(null); setStep('form'); }} hitSlop={8} style={{ alignSelf: 'center' }}>
                <Text style={styles.link}>Change the order</Text>
              </Pressable>
            </>
          ) : null}

          {step === 'waiting' ? (
            <View style={[styles.card, { alignItems: 'center', gap: Spacing.md }]}>
              <ActivityIndicator color={Colors.sage} />
              <Text style={styles.okTitle}>Payment sent</Text>
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
                {!result.code && !result.esimLink && kind !== 'topup' ? <Text style={styles.body}>Check your email: the code is sent to {email.trim()}.</Text> : null}
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
  card: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.sm },
  okCard: { borderColor: Colors.borderSage, backgroundColor: 'rgba(143,174,130,0.08)', gap: Spacing.md },
  okTitle: { ...Type.h3, color: Colors.sage },
  cardTitle: { ...Type.h3, color: Colors.tx0 },
  code: { fontFamily: Fonts.monoBold, fontSize: 20, letterSpacing: 1, color: Colors.tx0 },
});
