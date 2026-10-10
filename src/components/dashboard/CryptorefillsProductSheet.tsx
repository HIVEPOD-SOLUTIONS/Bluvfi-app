import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { CryptorefillsPaymentCard } from '@/components/chat/CryptorefillsPaymentCard';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient, useApiQuery } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
import type { CountryEntry } from '@/lib/bills-countries';
import {
  KIND_LABEL,
  beneficiaryFor,
  buildFallback,
  buildOrder,
  fixedPriceUsd,
  itemLabel,
  productNameFor,
  rangeProblem,
  type CrCatalogItem,
  type CrPaymentMethod,
} from '@/lib/cryptorefills-checkout';
import { categoryEmoji, prettyCategory, type CrBrand, type CrKind } from '@/lib/cryptorefills-categories';
import type { CrPartnerRequest, CrRail } from '@/lib/cryptorefills-types';
import { DIAL_CODES, emailProblem, phoneProblem, toE164 } from '@/lib/product-checkout';
import { Logo } from './CatalogParts';
import { Chip, Field, SummaryRow, Tag } from './ProductParts';

type Step = 'detail' | 'quoting' | 'pay';
type PayChoice = { rail: CrRail } | { other: CrPaymentMethod };

interface Props {
  open: boolean;
  onClose: () => void;
  brand: CrBrand | null;
  kind: CrKind;
  country: CountryEntry;
  onAskAi: (brand: CrBrand) => void;
}

/**
 * A Cryptorefills brand's page and checkout in the app, as on the website: pick a denomination (or type an amount), say who it's for,
 * choose how to pay (gasless USDC on Base or Solana, or another coin to a deposit address), and the payment card does the rest: it signs,
 * waits for delivery and shows the code right here.
 */
export function CryptorefillsProductSheet({ open, onClose, brand, kind, country, onAskAi }: Props) {
  const call = useApiClient();
  const { email: accountEmail } = useAuth();
  const cc = country.code.toLowerCase();

  const catalog = useApiQuery<{ items: CrCatalogItem[] }>(['cryptorefills-catalog', cc, brand?.brand_name], '/api/cryptorefills/catalog', { country: cc, brand: brand?.brand_name }, { enabled: open && !!brand, staleTime: 5 * 60_000, retry: 1 });
  const methodsQuery = useApiQuery<{ partnerEnabled: boolean; methods: CrPaymentMethod[] }>(['cryptorefills-methods'], '/api/cryptorefills/payment-methods', undefined, { enabled: open, staleTime: 5 * 60_000, retry: 0 });
  const items = catalog.data?.items ?? [];
  const methods = methodsQuery.data?.methods ?? [];

  const [step, setStep] = useState<Step>('detail');
  const [itemId, setItemId] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [email, setEmail] = useState(accountEmail ?? '');
  const [phone, setPhone] = useState('');
  const [pay, setPay] = useState<PayChoice>({ rail: 'base' });
  const [otherCoin, setOtherCoin] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [quote, setQuote] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('detail');
    setItemId(null);
    setValue('');
    setTried(false);
    setMessage(null);
    setQuote(null);
    setPay({ rail: 'base' });
    setOtherCoin(null);
    setPhone(`+${DIAL_CODES[country.code] ?? ''}`);
    setEmail((e) => e || accountEmail || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brand?.brand_name]);

  const item = useMemo(() => items.find((i) => i.product_id === itemId) ?? items[0] ?? null, [items, itemId]);
  const num = Number(value);
  const isTopup = kind === 'topup';
  const problems = {
    email: emailProblem(email),
    phone: isTopup ? phoneProblem(phone, country.code) : null,
    amount: item ? rangeProblem(item, num) : null,
  };
  const hasProblem = Object.values(problems).some(Boolean) || !item;
  const fixedPrice = item ? fixedPriceUsd(item) : null;

  const coins = useMemo(() => [...new Set(methods.map((m) => m.coin))].filter((c) => !(c.toUpperCase() === 'USDC' && methods.every((m) => m.coin !== c || ['base', 'solana'].includes(m.network.toLowerCase())))), [methods]);
  const networks = otherCoin ? methods.filter((m) => m.coin === otherCoin) : [];

  const proceed = async () => {
    setTried(true);
    setMessage(null);
    if (hasProblem || !item || !brand) return;
    // A range has no fixed price: ask Cryptorefills for a quote at this amount.
    if (item.is_range) {
      setStep('quoting');
      try {
        const res = await call<{ quote: { price_usdc: string } }>('/api/cryptorefills/price', { query: { productId: item.product_id, country: cc, brand: brand.brand_name, value: num } });
        const q = Number(res.quote.price_usdc);
        if (!(q > 0)) throw new Error('Couldn’t price this right now. Try again in a moment.');
        setQuote(q);
      } catch (e) {
        setMessage((e as Error)?.message || 'Couldn’t price this right now.');
        setStep('detail');
        return;
      }
    } else {
      setQuote(fixedPrice);
      if (!fixedPrice) {
        setMessage('Couldn’t price this right now. Try again in a moment.');
        return;
      }
    }
    setStep('pay');
  };

  // What the payment card gets: the same order the assistant would have built.
  const output = useMemo(() => {
    if (step !== 'pay' || !item || !brand || !quote) return null;
    const beneficiary = beneficiaryFor(kind, email, toE164(phone, country.code) ?? undefined);
    const productValue = item.is_range ? num : undefined;
    const common = {
      pendingCryptorefillsPayment: true as const,
      productName: productNameFor(item, brand.brand_name, productValue),
      priceUsd: Number(quote.toFixed(2)),
      recipient: beneficiary,
      kind,
      logoUrl: brand.logo_url,
      logoBg: brand.bg_color,
    };
    if ('other' in pay) {
      const partnerOrder: CrPartnerRequest = {
        email: email.trim(),
        brand_name: item.brand_name,
        country_code: country.code.toUpperCase(),
        denomination: item.is_range ? 'range' : item.denomination ?? item.denomination_label ?? '',
        ...(productValue !== undefined ? { product_value: productValue } : {}),
        beneficiary_account: beneficiary,
        coin: pay.other.coin,
        network: pay.other.network,
      };
      return { ...common, payWith: 'other' as const, partnerOrder };
    }
    const fallback = buildFallback({ email, beneficiary, item, productValue, country: country.code, rail: pay.rail, methods });
    return { ...common, payWith: pay.rail, rail: pay.rail, order: buildOrder({ email, beneficiary, item, productValue }), ...(fallback ? { fallbackPartnerOrder: fallback } : {}) };
  }, [step, item, brand, quote, kind, email, phone, country.code, num, pay, methods]);

  const onReport = (r: Record<string, unknown>) => {
    if (r.paid === false && r.error === 'Cancelled by user') setStep('detail');
  };

  const range = brand?.min && brand?.max ? `${brand.min} – ${brand.max}` : null;
  const payLabel = 'other' in pay ? `${pay.other.coin} · ${pay.other.network}` : `USDC · ${pay.rail === 'base' ? 'Base' : 'Solana'}`;

  return (
    <BottomSheet open={open} onClose={onClose} title={step === 'detail' ? 'Product' : 'Checkout'} snapPoints={['92%']} scrollable>
      {!brand ? null : (
        <View style={{ gap: Spacing.lg }}>
          <View style={styles.header}>
            <Logo uri={brand.logo_url} emoji={categoryEmoji(brand.category)} background={brand.bg_color ?? '#2A2B27'} size={52} fit="contain" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name} numberOfLines={2}>
                {brand.brand_name}
              </Text>
              <Text style={styles.sub}>
                {KIND_LABEL[kind]} · {prettyCategory(brand.category)} · {country.flag} {country.name}
              </Text>
            </View>
          </View>

          {step === 'pay' && output ? (
            <>
              <View style={styles.card}>
                <SummaryRow label="Product" value={output.productName} />
                <SummaryRow label="Price" value={`$${output.priceUsd.toFixed(2)}`} strong />
                <SummaryRow label={isTopup ? 'To' : 'Receipt to'} value={isTopup ? output.recipient : email.trim()} />
                <SummaryRow label="Pay with" value={payLabel} />
              </View>
              <CryptorefillsPaymentCard toolCallId={`product-${brand.brand_name}`} output={output} onReport={onReport} />
              <Pressable onPress={() => setStep('detail')} hitSlop={8} style={{ alignSelf: 'center' }}>
                <Text style={styles.link}>Change the order</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.tags}>
                {range ? <Text style={styles.range}>{range}</Text> : null}
                <Tag label="Pay with USDC · no gas" />
                <Tag label="Delivered by email and here" />
              </View>

              {catalog.isLoading ? (
                <View style={{ gap: 8 }}>
                  {[0.9, 0.6].map((w, i) => (
                    <View key={i} style={[styles.skeleton, { width: `${w * 100}%` }]} />
                  ))}
                </View>
              ) : catalog.isError || items.length === 0 ? (
                <View style={styles.note}>
                  <Text style={styles.small}>Couldn’t load this product’s options right now.</Text>
                  <Button variant="outline" onPress={() => catalog.refetch()}>
                    Try again
                  </Button>
                </View>
              ) : (
                <>
                  <View style={{ gap: 8 }}>
                    <Text style={styles.label}>{items.every((i) => i.is_range) ? 'AMOUNT' : 'CHOOSE'}</Text>
                    <View style={styles.tags}>
                      {items.map((i) => (
                        <Chip key={i.product_id} label={itemLabel(i)} sub={!i.is_range && fixedPriceUsd(i) ? `$${fixedPriceUsd(i)!.toFixed(2)}` : undefined} selected={item?.product_id === i.product_id} onPress={() => setItemId(i.product_id)} />
                      ))}
                    </View>
                  </View>
                  {item?.is_range ? (
                    <Field label={`Amount${item.currency ? ` (${item.currency})` : ''}`} value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder={`${item.min_value ?? ''} – ${item.max_value ?? ''}`} error={tried ? problems.amount : null} hint="The price in USDC is shown on the next step." />
                  ) : null}

                  {isTopup ? <Field label="Phone number to top up" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+234 801 234 5678" error={tried ? problems.phone : null} hint="With the country code, or just the number for your country." /> : null}
                  <Field label="Your email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" error={tried ? problems.email : null} hint="Your receipt, and the code or eSIM, are sent here." />

                  <View style={{ gap: 8 }}>
                    <Text style={styles.label}>PAY WITH</Text>
                    <View style={styles.tags}>
                      <Chip label="USDC · Base" sub="No gas" selected={'rail' in pay && pay.rail === 'base'} onPress={() => setPay({ rail: 'base' })} />
                      <Chip label="USDC · Solana" sub="No gas" selected={'rail' in pay && pay.rail === 'solana'} onPress={() => setPay({ rail: 'solana' })} />
                    </View>
                    {coins.length > 0 ? (
                      <>
                        <Text style={styles.hint}>Or another coin, sent to a deposit address:</Text>
                        <View style={styles.tags}>
                          {coins.slice(0, 14).map((c) => (
                            <Chip key={c} label={c} selected={otherCoin === c && 'other' in pay} onPress={() => { setOtherCoin(c); const ns = methods.filter((m) => m.coin === c); if (ns.length) setPay({ other: ns[0] }); }} />
                          ))}
                        </View>
                        {networks.length > 1 ? (
                          <View style={styles.tags}>
                            {networks.map((m) => (
                              <Chip key={m.network} label={m.network} selected={'other' in pay && pay.other.network === m.network && pay.other.coin === m.coin} onPress={() => setPay({ other: m })} />
                            ))}
                          </View>
                        ) : null}
                      </>
                    ) : null}
                  </View>

                  {message ? <Text style={styles.error}>{message}</Text> : null}
                  <Button variant="secondary" fullWidth loading={step === 'quoting'} onPress={proceed}>
                    {fixedPrice ? `Continue · $${fixedPrice.toFixed(2)}` : 'Continue'}
                  </Button>
                </>
              )}
              <Pressable onPress={() => onAskAi(brand)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'center' }}>
                <Text style={styles.link}>Ask the assistant about this</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  name: { ...Type.h2, color: Colors.tx0 },
  sub: { ...Type.small, color: Colors.tx1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  range: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.sage, backgroundColor: 'rgba(143,174,130,0.14)', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12, overflow: 'hidden' },
  skeleton: { height: 12, borderRadius: 6, backgroundColor: 'rgba(242,240,232,0.06)' },
  small: { ...Type.small, color: Colors.tx1 },
  hint: { ...Type.small, color: Colors.tx2 },
  label: { ...Type.label, color: Colors.tx2 },
  link: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.sage },
  error: { ...Type.small, color: Colors.redAlert },
  note: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  card: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.sm },
});
