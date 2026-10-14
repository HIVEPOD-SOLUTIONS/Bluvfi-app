/**
 * The pure rules behind buying a Bitrefill product inside the app (the product page and checkout, as on the website): how the product's
 * HTML text is shown, which payment methods it accepts, what it needs from the buyer (an email, a phone number, an account number),
 * the request that creates the invoice, and how the invoice's progress is read. No React and no network, so all of it is testable.
 */

// ── The product, as `/api/bitrefill/products/[id]` returns it ───────────────────────────────────────────────

export interface ProductPackage {
  package_id?: string;
  /** The denomination alone ("50"): what the invoice request takes as packageId. */
  package_value: string | number;
  price_usd?: number;
}

export interface ProductReview {
  content: string;
  score: number;
  author_name: string;
  date: string;
}

export interface ProductDetail {
  id: string;
  name: string;
  category?: string;
  currency?: string;
  logo_url?: string;
  packages?: ProductPackage[];
  range?: { min: number; max: number; step?: number; price_rate?: number };
  /** "phone_number" | "email" | "account" | "username" | "esim" | "none" */
  recipient_type?: string;
  account_id_name?: string;
  account_id_regex?: string;
  in_stock?: boolean;
  /** A bill-payment form the website walks through step by step; the app hands these to the assistant. */
  prepayment?: unknown;
  subtitles?: string;
  descriptions?: string;
  instructions?: string;
  termsConditions?: string;
  ratings?: { rating_value: number; rating_count: number };
  reviews?: ProductReview[];
  payment_methods?: { address_based?: string[]; link_only?: string[]; balance?: string[] };
}

export type CatalogSection = 'cards' | 'topup' | 'esim';
export type CheckoutKind = 'topup' | 'esim' | 'account' | 'username' | 'email' | 'card';

/** What kind of purchase this is. The product's own recipient type decides; the section it was found in is only a fallback. */
export function checkoutKind(product: Pick<ProductDetail, 'recipient_type'>, section: CatalogSection): CheckoutKind {
  const rt = product.recipient_type ?? '';
  if (rt === 'phone_number' || (!rt && section === 'topup')) return 'topup';
  if (rt === 'esim' || (!rt && section === 'esim')) return 'esim';
  if (rt === 'account') return 'account';
  if (rt === 'username') return 'username';
  if (rt === 'email') return 'email';
  if (section === 'topup') return 'topup';
  if (section === 'esim') return 'esim';
  return 'card';
}

/** The button on the product page, worded like the website. */
export function ctaLabel(product: Pick<ProductDetail, 'in_stock' | 'recipient_type'>, section: CatalogSection): string {
  if (product.in_stock === false) return 'Out of Stock';
  const kind = checkoutKind(product, section);
  return kind === 'topup' ? 'Refill Now' : kind === 'esim' ? 'Get Plan' : 'Buy Now';
}

// ── Text from the product's HTML ────────────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', euro: '€', pound: '£', copy: '©' };

/** The product description and instructions come as HTML. This turns them into plain paragraphs, with list items as "• " lines. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  const text = html
    .replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|h[1-6]|ul|ol|li|tr)\s*>/gi, '\n')
    .replace(/<\s*(p|div|h[1-6]|ul|ol|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

// ── Payment methods ─────────────────────────────────────────────────────────────────────────────────────────

// The catalogue of methods, their rails and logos live in payment-methods.ts and payment-logos.ts.
/** A Bitrefill payment method id, exactly as the invoice API takes it (see payment-methods.ts). */
export type BitrefillPaymentMethodId = string;

const METHOD_LABELS: Record<string, string> = {
  usdc_base: 'USDC (Base)', usdc_solana: 'USDC (Solana)', usdc_erc20: 'USDC (Ethereum)', usdc_polygon: 'USDC (Polygon)', usdc_arbitrum: 'USDC (Arbitrum)',
  usdc_optimism: 'USDC (Optimism)', usdc_bsc: 'USDC (BSC)', usdc_sui: 'USDC (SUI)', usdc_tempo: 'USDC (Tempo)', usdt_erc20: 'USDT (Ethereum)', usdt_polygon: 'USDT (Polygon)', usdt_arbitrum: 'USDT (Arbitrum)', usdt_bsc: 'USDT (BSC)',
  usdt_trc20: 'USDT (Tron)', usdt_tron: 'USDT (Tron)', usdt_ton: 'USDT (TON)', usdt_sui: 'USDT (SUI)', usdt_solana: 'USDT (Solana)', usdt_optimism: 'USDT (Optimism)', usdt_base: 'USDT (Base)', usdt_lightning: 'USDT (Lightning)', usdt_tempo: 'USDT (Tempo)', ethereum: 'Ethereum', eth_base: 'ETH (Base)', eth_arbitrum: 'ETH (Arbitrum)',
  solana: 'Solana', bitcoin: 'Bitcoin', lightning: 'Lightning', litecoin: 'Litecoin', dogecoin: 'Dogecoin', dash: 'Dash', ark: 'ARK', ton: 'TON', xrp: 'XRP',
  fiat_card: 'Card', google_pay: 'Google Pay', apple_pay: 'Apple Pay', balance: 'Bitrefill balance',
};

/** The methods the product page lists as accepted, readable. XRP is always there: Bluvfi pays it through a USDC invoice. */
export function acceptedMethodLabels(product: Pick<ProductDetail, 'payment_methods'> | null | undefined): string[] {
  const pm = product?.payment_methods;
  const ids = [...(pm?.address_based ?? []), ...(pm?.link_only ?? []), ...(pm?.balance ?? [])];
  const labels = ids.map((id) => METHOD_LABELS[id] ?? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
  if (!labels.includes('XRP')) labels.push('XRP');
  return [...new Set(labels)];
}

// ── What the buyer provides ─────────────────────────────────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function emailProblem(email: string): string | null {
  const v = email.trim();
  if (!v) return 'Enter your email. The receipt or code is sent there.';
  return EMAIL.test(v) ? null : 'That email doesn’t look right.';
}

export function giftProblem(on: boolean, name: string, email: string): string | null {
  if (!on) return null;
  if (!name.trim()) return 'Enter the recipient’s name.';
  const emailIssue = emailProblem(email);
  return emailIssue ? emailIssue.replace('your email', 'the recipient email').replace('receipt or code is sent there', 'gift is sent there') : null;
}

/** International dialling codes for the countries the Bills screens cover. */
export const DIAL_CODES: Readonly<Record<string, string>> = {
  US: '1', CA: '1', GB: '44', NG: '234', AU: '61', IN: '91', DE: '49', FR: '33', ES: '34', IT: '39', NL: '31', SE: '46', BR: '55', MX: '52', AR: '54',
  CO: '57', ZA: '27', KE: '254', GH: '233', EG: '20', AE: '971', SA: '966', SG: '65', PH: '63', ID: '62', JP: '81', PK: '92', BD: '880', PL: '48', TR: '90',
};

/** The number in international form ("+2348012345678"), or null when it can't be one. Accepts "+234 801…", "0801…", "801…" and "00234…". */
export function toE164(input: string, countryCode: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  let national: string;
  if (digits.startsWith('+')) {
    const all = digits.slice(1).replace(/\D/g, '');
    return /^[1-9]\d{7,14}$/.test(all) ? `+${all}` : null;
  }
  const dial = DIAL_CODES[countryCode.toUpperCase()];
  if (!dial) return null;
  if (digits.startsWith('00')) {
    const all = digits.slice(2);
    return /^[1-9]\d{7,14}$/.test(all) ? `+${all}` : null;
  }
  national = digits.replace(/^0+/, '');
  if (national.startsWith(dial) && national.length > dial.length + 6) national = national.slice(dial.length);
  // A national number is at least six digits (the shortest real ones), so a stray handful of digits is refused.
  if (national.length < 6) return null;
  const all = `${dial}${national}`;
  return /^[1-9]\d{7,14}$/.test(all) ? `+${all}` : null;
}

export function phoneProblem(input: string, countryCode: string): string | null {
  return toE164(input, countryCode) ? null : 'Enter the phone number to top up, with its area code.';
}

/** A problem with the account number, username or delivery email a product asks for, or null. */
export function refillInputProblem(product: Pick<ProductDetail, 'account_id_regex' | 'account_id_name'>, kind: CheckoutKind, value: string): string | null {
  const v = value.trim();
  const label = product.account_id_name?.trim() || (kind === 'username' ? 'username' : kind === 'email' ? 'delivery email' : 'account ID');
  if (!v) return `Enter the ${label.toLowerCase()}.`;
  if (kind === 'email') return EMAIL.test(v) ? null : 'That email doesn’t look right.';
  if (product.account_id_regex) {
    try {
      if (!new RegExp(product.account_id_regex).test(v)) return `That doesn’t look like a valid ${label.toLowerCase()}.`;
    } catch {
      /* an unusable pattern from the catalog: let Bitrefill check it */
    }
  }
  return null;
}

// ── Amount ──────────────────────────────────────────────────────────────────────────────────────────────────

export type Amount = { kind: 'package'; pkg: ProductPackage } | { kind: 'custom'; value: number };

/** Fixed products list their denominations; the rest take any amount in a range. */
export const hasFixedPackages = (p: Pick<ProductDetail, 'packages'>) => (p.packages?.length ?? 0) > 0;

/** Range products let the buyer type an amount, even if a catalog row still carried old denominations. */
export const usesTypedAmount = (p: Pick<ProductDetail, 'range'>) => !!p.range;

export function amountProblem(product: Pick<ProductDetail, 'range' | 'currency'>, value: number): string | null {
  const r = product.range;
  if (!r) return 'This product has no amount to choose.';
  if (!Number.isFinite(value) || value <= 0) return 'Enter an amount.';
  const cur = product.currency && product.currency !== 'USD' ? ` ${product.currency}` : '';
  if (value < r.min || value > r.max) return `Enter an amount between ${r.min} and ${r.max}${cur}.`;
  if (r.step && r.step > 0 && Math.abs(value / r.step - Math.round(value / r.step)) > 1e-9 && r.min % r.step === 0) return `The amount must be a multiple of ${r.step}.`;
  return null;
}

/** The price in US dollars for a choice, when the catalog says (fixed packages, or a range with a rate). */
export function priceUsd(product: Pick<ProductDetail, 'range'>, amount: Amount): number | null {
  if (amount.kind === 'package') return typeof amount.pkg.price_usd === 'number' ? amount.pkg.price_usd : null;
  const rate = product.range?.price_rate;
  return rate ? Number((amount.value * rate).toFixed(2)) : null;
}

export const packageValueOf = (pkg: ProductPackage): string => String(pkg.package_value);

/** How a denomination is shown on its chip: "$25", or "NGN 500" when the product isn't in dollars. */
export function packageLabel(pkg: ProductPackage, currency?: string): string {
  const v = packageValueOf(pkg);
  if (!currency || currency === 'USD') return `$${v}`;
  return `${v} ${currency}`;
}

// ── The invoice ─────────────────────────────────────────────────────────────────────────────────────────────

export interface InvoiceRequestInput {
  product: Pick<ProductDetail, 'id'>;
  kind: CheckoutKind;
  amount: Amount;
  method: BitrefillPaymentMethodId;
  /** The buyer's email: the receipt, and the code for cards and eSIMs. */
  email: string;
  /** The phone number in international form, for top-ups. */
  phoneE164?: string;
  /** The account number, username or delivery email, for products that ask for one. */
  refillInput?: string;
  gift?: { recipientName: string; recipientEmail: string; message?: string; theme?: string } | null;
}

/** The body for POST /api/bitrefill/invoice, the same one the website sends. */
export function invoiceRequestBody(i: InvoiceRequestInput): Record<string, unknown> {
  const sendTo = i.kind === 'topup' ? i.phoneE164 : i.kind === 'account' || i.kind === 'username' || i.kind === 'email' ? i.refillInput?.trim() : undefined;
  return {
    productId: i.product.id,
    ...(i.amount.kind === 'package' ? { packageId: packageValueOf(i.amount.pkg) } : { customValue: i.amount.value }),
    paymentMethod: i.method,
    recipientEmail: i.email.trim(),
    ...(sendTo ? { sendTo } : {}),
    ...(i.gift
      ? {
          gift: {
            recipient_name: i.gift.recipientName.trim(),
            recipient_email: i.gift.recipientEmail.trim(),
            // Bitrefill requires a sender name for a gift; the website sends the same one.
            sender_name: 'Bluvfi',
            ...(i.gift.message?.trim() ? { message: i.gift.message.trim() } : {}),
            ...(i.gift.theme ? { theme: i.gift.theme } : {}),
          },
        }
      : {}),
  };
}

export interface PendingPayment {
  invoiceId: string;
  accessToken?: string;
  paymentMethod: string;
  paymentAddress: string;
  paymentAmount: number | string;
  paymentCurrency?: string;
  isTopup: boolean;
  expiresInMinutes?: number;
}

/** What the payment card needs, read from the invoice Bitrefill returned. Null when the invoice has no address to pay. */
export function pendingFromInvoice(inv: any, method: string, isTopup: boolean): PendingPayment | null {
  const invoiceId: string = inv?.invoice_id ?? inv?.id ?? '';
  const address: string | undefined = inv?.payment_info?.address ?? inv?.payment?.address;
  const amount = inv?.payment_info?.altcoinPrice ?? inv?.payment_info?.amount ?? inv?.payment?.price;
  if (!invoiceId || !address || amount === undefined || amount === null || Number(amount) <= 0) return null;
  return {
    invoiceId,
    accessToken: inv?.invoice_access_token ?? undefined,
    paymentMethod: method,
    paymentAddress: address,
    paymentAmount: amount,
    paymentCurrency: inv?.payment_info?.currency ?? 'USDC',
    isTopup,
    expiresInMinutes: inv?.expiration_minutes ?? undefined,
  };
}

export type InvoiceOutcome =
  | { state: 'done'; code: string | null; esimLink: string | null; instructions: string | null }
  | { state: 'failed'; message: string }
  | { state: 'waiting'; message: string };

/** Reads one answer from GET /api/bitrefill/invoice/[id]: delivered, failed, or still on its way. */
export function invoiceOutcome(inv: any, isTopup: boolean, awaitingPayment = false): InvoiceOutcome {
  const status = String(inv?.status ?? inv?.invoice_status ?? '').toLowerCase();
  if (status === 'complete' || status === 'completed' || status === 'delivered') {
    const order = Array.isArray(inv?.orders) ? inv.orders[0] : undefined;
    const info = order?.redemption_info;
    const code: string | null = inv?.code ?? info?.pin ?? info?.code ?? null;
    const esimLink: string | null = inv?.esim_install_link ?? order?.esim_install_link ?? inv?.esim_install_links?.[0] ?? info?.link ?? null;
    return { state: 'done', code: isTopup ? null : code, esimLink, instructions: info?.instructions ?? null };
  }
  if (status === 'failed' || status === 'expired' || status === 'cancelled' || status === 'canceled') {
    return { state: 'failed', message: status === 'expired' ? 'The order expired before it was completed.' : 'Bitrefill couldn’t complete this order.' };
  }
  if (status === 'blocked') return { state: 'failed', message: 'Bitrefill put this order on hold for a compliance check. Visit Bitrefill to finish it.' };
  // A deposit that hasn't been sent yet is still "unpaid": say so, rather than claiming a payment that hasn't happened.
  if (awaitingPayment && (status === '' || status === 'unpaid' || status === 'created' || status === 'new' || status === 'pending')) return { state: 'waiting', message: 'Waiting for your payment…' };
  return {
    state: 'waiting',
    message: status === 'payment_detected' || status === 'payment_confirmed' ? 'Payment detected. Confirming…' : 'Payment sent. Bitrefill is processing the order…',
  };
}

/** Polling gives up after this long; the order still completes and shows in purchase history. */
export const POLL_EVERY_MS = 4_000;
export const POLL_GIVE_UP_MS = 6 * 60 * 1000;

/** Deposit-address orders (Bitcoin, Tron USDT, XRP…) can take a while to be sent and confirmed; the invoice itself stays open about 15 minutes. */
export const DEPOSIT_POLL_GIVE_UP_MS = 15 * 60 * 1000;

/** The body for POST /api/bitrefill/xrp-purchase: the same as the invoice request but with no payment method (XRP isn't a Bitrefill method) and no gift. */
export function xrpRequestBody(i: InvoiceRequestInput): Record<string, unknown> {
  const { paymentMethod: _method, gift: _gift, ...rest } = invoiceRequestBody({ ...i, gift: null });
  return rest;
}

/**
 * The body for POST /api/bitrefill/chain-purchase (Zcash, Hyperliquid, Arc, Tempo, Robinhood Chain): the invoice request without a payment
 * method, plus the chain and where a failed payment is refunded. A gift is sent through the recipient's name and email (Bitrefill emails it to
 * them from Bluvfi); this route has no personal message.
 */
export function chainRequestBody(i: InvoiceRequestInput, refundAddress: string): Record<string, unknown> {
  const { paymentMethod: _method, gift: _gift, recipientEmail, ...rest } = invoiceRequestBody({ ...i, gift: null });
  return {
    ...rest,
    chain: i.method,
    refundAddress,
    recipientEmail: i.gift ? i.gift.recipientEmail.trim() : recipientEmail,
    ...(i.gift ? { recipientName: i.gift.recipientName.trim() } : {}),
  };
}

export interface DepositDetails {
  address: string;
  /** The exact amount in the coin, or null when Bitrefill gave none (its checkout page shows it). */
  amount: string | null;
  currency: string;
  paymentUri: string | null;
  paymentLink: string | null;
  expiresInMinutes: number | null;
}

/** The deposit address and amount from an invoice for an address-based method. Null when Bitrefill returned no address. */
export function depositFromInvoice(inv: any): DepositDetails | null {
  const address: string | undefined = inv?.payment_info?.address ?? inv?.payment?.address;
  if (!address) return null;
  const amount = inv?.payment_info?.altcoinPrice ?? inv?.payment_info?.amount ?? inv?.payment?.price;
  return {
    address,
    amount: amount !== undefined && amount !== null && Number(amount) > 0 ? String(amount) : null,
    currency: inv?.payment_info?.currency ?? '',
    paymentUri: inv?.payment_info?.paymentUri ?? null,
    paymentLink: inv?.payment_link ?? null,
    expiresInMinutes: inv?.expiration_minutes ?? null,
  };
}

export interface XrpOrder {
  invoiceId: string;
  accessToken?: string;
  /** The swap address to send XRP to, and the exact amount (the swap plus the XRPL activation reserve). */
  address: string;
  amountXrp: string;
  swapWalletId: string | null;
  /** The person's own Bluvfi XRP wallet, when the server returned it (it can pay the swap with one tap). */
  sidebarWalletId: string | null;
  expiresInMinutes: number | null;
}

/** Reads POST /api/bitrefill/xrp-purchase. Null when the swap address or amount is missing. */
export function xrpOrderFrom(res: any): XrpOrder | null {
  const invoiceId: string = res?.invoiceId ?? '';
  const address: string = res?.paymentAddress ?? '';
  const amount = res?.requiredActivationXrp;
  if (!invoiceId || !address || amount === undefined || amount === null || !(Number(amount) > 0)) return null;
  return {
    invoiceId,
    accessToken: res?.invoiceAccessToken ?? undefined,
    address,
    amountXrp: String(amount),
    swapWalletId: res?.xrplWalletRequestId ?? null,
    sidebarWalletId: res?.sidebarWallet?.id ?? null,
    expiresInMinutes: res?.expirationMinutes ?? null,
  };
}
