/**
 * Every way to pay for a Bitrefill product, as the website lists them (bluvfi/src/components/dashboard/bills-screen.tsx), and how the app
 * pays each one. The id is what Bitrefill's invoice API takes, so it must be exactly one of its payment methods.
 *
 *   wallet   the app pays it from the Bluvfi wallet in one tap (USDC or USDT on Base, Ethereum, Polygon, Arbitrum, Optimism or Solana)
 *   address  Bitrefill gives a deposit address and exact amount; the person sends it from any wallet and the order completes by itself
 *   xrp      a Bluvfi-only method: the invoice is settled in USDC behind the scenes (POST /api/bitrefill/xrp-purchase), and the person
 *            sends XRP to a swap address (or pays it from their Bluvfi XRP wallet). Never sent to the invoice API as a method.
 *   link     Bitrefill's own checkout page (Binance Pay, Kraken Pay)
 *
 * Pure data and rules: no React, no network, so it can be tested.
 */

export type Rail = 'wallet' | 'address' | 'xrp' | 'link';
export type MethodGroup = 'USDT' | 'USDC' | 'BRUSD' | 'Crypto' | 'Exchange Pay';

export type ChainKey =
  | 'ethereum' | 'base' | 'polygon' | 'arbitrum' | 'optimism' | 'bsc' | 'solana' | 'tron' | 'ton' | 'sui'
  | 'bitcoin' | 'lightning' | 'xrpl' | 'litecoin' | 'dogecoin' | 'dash' | 'ark' | 'tempo' | 'binance' | 'kraken';

export interface PaymentMethod {
  id: string;
  group: MethodGroup;
  /** The coin or token that is sent: USDC, USDT, ETH, BTC… */
  token: string;
  /** The network it is sent on. */
  chain: ChainKey;
  /** What the chip says (the website's label). */
  label: string;
  rail: Rail;
}

const m = (id: string, group: MethodGroup, token: string, chain: ChainKey, label: string, rail: Rail): PaymentMethod => ({ id, group, token, chain, label, rail });

/** In the website's order. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  // USDT
  m('usdt_erc20', 'USDT', 'USDT', 'ethereum', 'Ethereum', 'wallet'),
  m('usdt_base', 'USDT', 'USDT', 'base', 'Base', 'wallet'),
  m('usdt_solana', 'USDT', 'USDT', 'solana', 'Solana', 'wallet'),
  m('usdt_polygon', 'USDT', 'USDT', 'polygon', 'Polygon', 'wallet'),
  m('usdt_arbitrum', 'USDT', 'USDT', 'arbitrum', 'Arbitrum', 'wallet'),
  m('usdt_optimism', 'USDT', 'USDT', 'optimism', 'Optimism', 'wallet'),
  m('usdt_bsc', 'USDT', 'USDT', 'bsc', 'BSC', 'address'),
  m('usdt_trc20', 'USDT', 'USDT', 'tron', 'Tron', 'address'),
  m('usdt_ton', 'USDT', 'USDT', 'ton', 'TON', 'address'),
  m('usdt_sui', 'USDT', 'USDT', 'sui', 'SUI', 'address'),
  m('usdt_lightning', 'USDT', 'USDT', 'lightning', 'Lightning', 'address'),
  // USDC
  m('usdc_base', 'USDC', 'USDC', 'base', 'Base', 'wallet'),
  m('usdc_solana', 'USDC', 'USDC', 'solana', 'Solana', 'wallet'),
  m('usdc_erc20', 'USDC', 'USDC', 'ethereum', 'Ethereum', 'wallet'),
  m('usdc_polygon', 'USDC', 'USDC', 'polygon', 'Polygon', 'wallet'),
  m('usdc_arbitrum', 'USDC', 'USDC', 'arbitrum', 'Arbitrum', 'wallet'),
  m('usdc_optimism', 'USDC', 'USDC', 'optimism', 'Optimism', 'wallet'),
  m('usdc_bsc', 'USDC', 'USDC', 'bsc', 'BSC', 'address'),
  m('usdc_sui', 'USDC', 'USDC', 'sui', 'SUI', 'address'),
  // BRUSD
  m('brusd_base', 'BRUSD', 'BRUSD', 'base', 'Base', 'address'),
  m('brusd_erc20', 'BRUSD', 'BRUSD', 'ethereum', 'Ethereum', 'address'),
  m('brusd_polygon', 'BRUSD', 'BRUSD', 'polygon', 'Polygon', 'address'),
  m('brusd_arbitrum', 'BRUSD', 'BRUSD', 'arbitrum', 'Arbitrum', 'address'),
  m('brusd_bsc', 'BRUSD', 'BRUSD', 'bsc', 'BSC', 'address'),
  // Crypto
  m('ethereum', 'Crypto', 'ETH', 'ethereum', 'ETH', 'address'),
  m('eth_base', 'Crypto', 'ETH', 'base', 'ETH', 'address'),
  m('eth_arbitrum', 'Crypto', 'ETH', 'arbitrum', 'ETH', 'address'),
  m('solana', 'Crypto', 'SOL', 'solana', 'SOL', 'address'),
  m('sui', 'Crypto', 'SUI', 'sui', 'SUI', 'address'),
  m('bnb_bsc', 'Crypto', 'BNB', 'bsc', 'BNB', 'address'),
  m('bitcoin', 'Crypto', 'BTC', 'bitcoin', 'Bitcoin', 'address'),
  m('lightning', 'Crypto', 'BTC', 'lightning', 'Lightning', 'address'),
  m('ton', 'Crypto', 'TON', 'ton', 'TON', 'address'),
  m('xrp', 'Crypto', 'XRP', 'xrpl', 'XRP', 'xrp'),
  m('litecoin', 'Crypto', 'LTC', 'litecoin', 'Litecoin', 'address'),
  m('dogecoin', 'Crypto', 'DOGE', 'dogecoin', 'Dogecoin', 'address'),
  m('dash', 'Crypto', 'DASH', 'dash', 'Dash', 'address'),
  m('ark', 'Crypto', 'ARK', 'ark', 'ARK', 'address'),
  m('brc_solana', 'Crypto', 'BRC', 'solana', 'BRC', 'address'),
  m('usdc_tempo', 'Crypto', 'USDC', 'tempo', 'USDC', 'address'),
  m('usdt_tempo', 'Crypto', 'USDT', 'tempo', 'USDT', 'address'),
  // Exchange Pay
  m('binance_pay', 'Exchange Pay', 'BNB', 'binance', 'Binance Pay', 'link'),
  m('kraken_pay', 'Exchange Pay', 'KRAKEN', 'kraken', 'Kraken Pay', 'link'),
];

export type PaymentMethodId = string;

export const GROUP_ORDER: readonly MethodGroup[] = ['USDT', 'USDC', 'BRUSD', 'Crypto', 'Exchange Pay'];

export const methodById = (id: string): PaymentMethod | undefined => PAYMENT_METHODS.find((x) => x.id === id);
export const railOf = (id: string): Rail => methodById(id)?.rail ?? 'address';

/** Bitrefill doesn't list these for every product (the website hides them unless the product's own list has them), so they are never offered on a guess. */
const ONLY_IF_LISTED = new Set(['usdt_base', 'usdt_optimism', 'usdc_optimism']);

/** What is offered when a product's own list of accepted methods hasn't arrived: the wallet methods Bitrefill has always accepted, and XRP. */
const SAFE_DEFAULT = new Set(['usdc_base', 'usdc_solana', 'usdc_erc20', 'usdc_polygon', 'usdc_arbitrum', 'usdt_erc20', 'usdt_polygon', 'usdt_arbitrum', 'usdt_solana', 'xrp']);

type Accepted = { address_based?: string[]; link_only?: string[]; balance?: string[] } | undefined;

/** The ids a product accepts, or null when its list hasn't been loaded. */
export function acceptedIds(pm: Accepted): Set<string> | null {
  if (!pm) return null;
  const all = [...(pm.address_based ?? []), ...(pm.link_only ?? []), ...(pm.balance ?? [])];
  return all.length ? new Set(all) : null;
}

/**
 * The methods to offer for a product, grouped like the website. XRP is always there (it isn't a Bitrefill method, it is settled through a USDC
 * invoice). Fiat methods are left out: the app is crypto-first, as on the website.
 */
export function methodsForProduct(pm: Accepted): { group: MethodGroup; methods: PaymentMethod[] }[] {
  const accepted = acceptedIds(pm);
  const offered = PAYMENT_METHODS.filter((x) => {
    if (x.id === 'xrp') return true;
    if (accepted) return accepted.has(x.id);
    return SAFE_DEFAULT.has(x.id) && !ONLY_IF_LISTED.has(x.id);
  });
  return GROUP_ORDER.map((group) => ({ group, methods: offered.filter((x) => x.group === group) })).filter((g) => g.methods.length > 0);
}

/** The method to start on: USDC on Base when offered, otherwise the first one. */
export function defaultMethod(groups: readonly { methods: readonly PaymentMethod[] }[]): string | null {
  const all = groups.flatMap((g) => g.methods);
  return (all.find((x) => x.id === 'usdc_base') ?? all[0])?.id ?? null;
}

/** "USDC on Base", "XRP on XRP Ledger": for the pay button and the order summary. */
export function methodSummary(x: PaymentMethod): string {
  return `${x.token} on ${CHAIN_NAME[x.chain]}`;
}

export const CHAIN_NAME: Record<ChainKey, string> = {
  ethereum: 'Ethereum', base: 'Base', polygon: 'Polygon', arbitrum: 'Arbitrum', optimism: 'Optimism', bsc: 'BSC', solana: 'Solana', tron: 'Tron', ton: 'TON', sui: 'SUI',
  bitcoin: 'Bitcoin', lightning: 'Lightning', xrpl: 'XRP Ledger', litecoin: 'Litecoin', dogecoin: 'Dogecoin', dash: 'Dash', ark: 'ARK', tempo: 'Tempo', binance: 'Binance Pay', kraken: 'Kraken Pay',
};

/** A sentence for what went wrong creating an order, so people never see a raw API error. */
export function friendlyInvoiceError(message: string | undefined | null): string {
  const raw = (message ?? '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return 'Couldn’t create the order. Please try again.';
  if (/invalid_value|invalid arguments|input validation|-32602/.test(lower)) return 'That payment method isn’t available for this product. Please pick another one.';
  if (/not configured|501/.test(lower) && /xrp/.test(lower)) return 'Paying with XRP isn’t available right now. Please pick another method.';
  if (/purchase_limit|daily purchase|max number of daily/.test(lower)) return 'You’ve reached the daily purchase limit for guest checkout (2 orders a day). Try again tomorrow.';
  if (/rate_limit|quota|too many requests/.test(lower)) return 'Too many requests right now. Please wait a moment and try again.';
  if (/streamable http error|bad gateway|<!doctype html|unavailable/.test(lower)) return 'Bitrefill is temporarily unavailable. Please try again in a few minutes.';
  if (/mcp error|error posting|\{.*\}/.test(lower)) return 'Bitrefill couldn’t create this order. Please try again or pick another payment method.';
  return raw.length > 220 ? `${raw.slice(0, 217)}…` : raw;
}
