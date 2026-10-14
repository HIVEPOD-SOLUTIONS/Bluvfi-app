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
import { crChainLogo, crTokenLogo } from '@/lib/cryptorefills-logos';
import { chainLogo, tokenLogo } from '@/lib/payment-logos';
import { DIAL_CODES, emailProblem, giftProblem, phoneProblem, toE164 } from '@/lib/product-checkout';
import { ChainTopUpPanel } from './ChainTopUpPanel';
import { Logo } from './CatalogParts';
import { Chip, Field, SummaryRow, Tag } from './ProductParts';
import { SWAP_CHAINS, SWAP_CHAIN_META, type SwapChain } from '@/lib/swap-chains';
import { LogoChip, TokenChainLogo } from './PaymentMethodPicker';

type Step = 'detail' | 'quoting' | 'pay';
/** 'chain': top up the Bluvfi wallet on Base from Arc, Tempo, Robinhood Chain, Zcash or Hyperliquid first, then pay on Base as usual. */
type PayChoice = { rail: CrRail } | { other: CrPaymentMethod } | { chain: SwapChain };

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
  // Set once the top-up from another chain has landed on Base, so the normal payment can go ahead.
  const [funded, setFunded] = useState(false);
  const [tried, setTried] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [quote, setQuote] = useState<number | null>(null);
  const [isGift, setIsGift] = useState(false);
  const [giftName, setGiftName] = useState('');
  const [giftEmail, setGiftEmail] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('detail');
    setItemId(null);
    setValue('');
    setTried(false);
    setMessage(null);
    setQuote(null);
    setPay({ rail: 'base' });
    setFunded(false);
    setIsGift(false);
    setGiftName('');
    setGiftEmail('');
    setPhone(`+${DIAL_CODES[country.code] ?? ''}`);
    setEmail((e) => e || accountEmail || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brand?.brand_name]);

  const item = useMemo(() => items.find((i) => i.product_id === itemId) ?? items[0] ?? null, [items, itemId]);
  const num = Number(value);
  const isTopup = kind === 'topup';
  // A gift sends the code or eSIM to someone else's email. A phone top-up already goes to whichever number is entered, so it needs no toggle.
  const giftable = !isTopup;
  const gifting = isGift && giftable;
  const problems = {
    gift: gifting ? giftProblem(true, giftName, giftEmail) : null,
    email: emailProblem(email),
    phone: isTopup ? phoneProblem(phone, country.code) : null,
    amount: item ? rangeProblem(item, num) : null,
  };
  const hasProblem = Object.values(problems).some(Boolean) || !item;
  const fixedPrice = item ? fixedPriceUsd(item) : null;

  // Every coin with every network it can be sent on, listed up front like Bitrefill's (USDC on Base and Solana are the gasless chips above).
  const coinGroups = useMemo(() => {
    const by = new Map<string, CrPaymentMethod[]>();
    for (const m of methods) {
      if (m.coin.toUpperCase() === 'USDC' && ['base', 'solana'].includes(m.network.toLowerCase())) continue;
      by.set(m.coin, [...(by.get(m.coin) ?? []), m]);
    }
    return [...by.entries()];
  }, [methods]);

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
    const beneficiary = gifting ? giftEmail.trim() : beneficiaryFor(kind, email, toE164(phone, country.code) ?? undefined);
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
    // Paying from another chain ends as a gasless USDC payment on Base, once the wallet has been topped up.
    const rail: CrRail = 'rail' in pay ? pay.rail : 'base';
    const fallback = buildFallback({ email, beneficiary, item, productValue, country: country.code, rail, methods });
    return { ...common, payWith: rail, rail, order: buildOrder({ email, beneficiary, item, productValue }), ...(fallback ? { fallbackPartnerOrder: fallback } : {}) };
  }, [step, item, brand, quote, kind, email, phone, country.code, num, pay, methods, gifting, giftEmail]);

  const onReport = (r: Record<string, unknown>) => {
    if (r.paid === false && r.error === 'Cancelled by user') setStep('detail');
  };

  const range = brand?.min && brand?.max ? `${brand.min} – ${brand.max}` : null;
  const payLabel = 'other' in pay ? `${pay.other.coin} · ${pay.other.network}` : 'chain' in pay ? `${SWAP_CHAIN_META[pay.chain].label}, then USDC · Base` : `USDC · ${pay.rail === 'base' ? 'Base' : 'Solana'}`;

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
                {gifting ? <SummaryRow label="Gift to" value={`${giftName.trim()} · ${giftEmail.trim()}`} /> : null}
                <SummaryRow label={isTopup ? 'To' : gifting ? 'Your receipt' : 'Receipt to'} value={isTopup ? output.recipient : email.trim()} />
                <SummaryRow label="Pay with" value={payLabel} />
              </View>
              {'chain' in pay && !funded ? (
                <ChainTopUpPanel key={pay.chain} initialChain={pay.chain} token="usdc" amount={output.priceUsd.toFixed(2)} amountUsd={output.priceUsd} purpose="cryptorefills" reference={output.productName} title={`Pay $${output.priceUsd.toFixed(2)} from another chain`} onFunded={() => setFunded(true)} />
              ) : (
                <CryptorefillsPaymentCard toolCallId={`product-${brand.brand_name}`} output={output} onReport={onReport} />
              )}
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
                  <Field label="Your email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" error={tried ? problems.email : null} hint={gifting ? 'Your receipt is sent here.' : 'Your receipt, and the code or eSIM, are sent here.'} />

                  {giftable ? (
                    <>
                      <Pressable onPress={() => setIsGift((g) => !g)} accessibilityRole="switch" accessibilityState={{ checked: isGift }} style={[styles.giftToggle, isGift && styles.giftToggleOn]}>
                        <Text style={styles.giftTitle}>🎁 Send as a Gift</Text>
                        <View style={[styles.switchTrack, isGift && styles.switchTrackOn]}>
                          <View style={[styles.switchThumb, isGift && styles.switchThumbOn]} />
                        </View>
                      </Pressable>
                      {isGift ? (
                        <View style={styles.giftBox}>
                          <Text style={styles.hint}>The code or eSIM is sent straight to the recipient’s email.</Text>
                          <Field label="Recipient Name" value={giftName} onChangeText={setGiftName} placeholder="e.g. Jane Doe" autoCapitalize="words" error={tried && problems.gift?.includes('name') ? problems.gift : null} />
                          <Field label="Recipient Email" value={giftEmail} onChangeText={setGiftEmail} keyboardType="email-address" placeholder="recipient@example.com" error={tried && problems.gift && !problems.gift.includes('name') ? problems.gift : null} />
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.hint}>🎁 A top-up is a gift whenever the number above belongs to someone else: it is credited to that number.</Text>
                  )}

                  <View style={{ gap: 8 }}>
                    <Text style={styles.label}>PAY WITH</Text>
                    <View style={styles.tags}>
                      <LogoChip logo={<TokenChainLogo token={tokenLogo('USDC')} chain={chainLogo('base')} />} label="USDC · Base" sub="No gas" selected={'rail' in pay && pay.rail === 'base'} onPress={() => setPay({ rail: 'base' })} />
                      <LogoChip logo={<TokenChainLogo token={tokenLogo('USDC')} chain={chainLogo('solana')} />} label="USDC · Solana" sub="No gas" selected={'rail' in pay && pay.rail === 'solana'} onPress={() => setPay({ rail: 'solana' })} />
                      {SWAP_CHAINS.map((c) => (
                        <LogoChip key={c} logo={<TokenChainLogo token={chainLogo(c)} />} label={SWAP_CHAIN_META[c].label} sub={`${SWAP_CHAIN_META[c].symbol} · via Base`} selected={'chain' in pay && pay.chain === c} onPress={() => { setPay({ chain: c }); setFunded(false); }} />
                      ))}
                    </View>
                    {coinGroups.length > 0 ? (
                      <>
                        <Text style={styles.hint}>Or another coin or network, sent to a deposit address:</Text>
                        {coinGroups.map(([coin, ms]) => (
                          <View key={coin} style={{ gap: 6 }}>
                            <Text style={styles.coinTitle}>{coin}</Text>
                            <View style={styles.tags}>
                              {ms.map((m) => {
                                const token = crTokenLogo(coin);
                                const chain = crChainLogo(m.network, coin);
                                // A coin on its own chain (BTC on Bitcoin) needs no second logo.
                                const badge = chain.uris[0] && chain.uris[0] === token.uris[0] ? null : chain;
                                return (
                                  <LogoChip
                                    key={`${coin}-${m.network}`}
                                    logo={<TokenChainLogo token={token} chain={badge} />}
                                    label={m.network}
                                    sub={coin}
                                    selected={'other' in pay && pay.other.network === m.network && pay.other.coin === m.coin}
                                    onPress={() => setPay({ other: m })}
                                  />
                                );
                              })}
                            </View>
                          </View>
                        ))}
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
  coinTitle: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx1, letterSpacing: 0.6 },
  label: { ...Type.label, color: Colors.tx2 },
  link: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.sage },
  error: { ...Type.small, color: Colors.redAlert },
  note: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  card: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.sm },
  giftToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, backgroundColor: Colors.bg0 },
  giftToggleOn: { borderColor: Colors.borderSage, backgroundColor: 'rgba(143,174,130,0.08)' },
  giftTitle: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  giftBox: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  switchTrack: { width: 38, height: 22, borderRadius: 999, backgroundColor: Colors.bg3, justifyContent: 'center', paddingHorizontal: 3 },
  switchTrackOn: { backgroundColor: Colors.sage },
  switchThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.tx0 },
  switchThumbOn: { alignSelf: 'flex-end', backgroundColor: Colors.bg0 },
});
