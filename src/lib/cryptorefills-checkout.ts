import type { CrOrderRequest, CrPartnerRequest, CrRail } from '@/lib/cryptorefills-types';
import type { CrKind } from '@/lib/cryptorefills-categories';

/**
 * The pure rules behind buying a Cryptorefills product inside the app: the catalog item as `/api/cryptorefills/catalog` returns it, what each
 * choice costs, and the order requests the payment card takes. Mirrors what the assistant's buy_cryptorefills_product tool builds on the
 * server, so a purchase made on the product page and one made in chat are the same order.
 */

/** One purchasable item of a brand (a fixed denomination, or a range the buyer picks an amount from). */
export interface CrCatalogItem {
  product_id: string;
  product_name?: string;
  brand_name: string;
  denomination?: string;
  denomination_label?: string;
  currency?: string;
  is_range: boolean;
  /** Indicative USDC price for a fixed item; the word "variable" for a range. */
  price_usdc: string;
  country_code: string;
  min_value?: number;
  max_value?: number;
}

export interface CrPaymentMethod {
  coin: string;
  network: string;
}

export const KIND_LABEL: Record<CrKind, string> = { cards: 'Gift card', topup: 'Phone refill', esim: 'eSIM plan' };

/** "$25" or "500 NGN": how a fixed item is shown on its chip. */
export function itemLabel(item: CrCatalogItem): string {
  if (item.is_range) return item.currency ? `${item.min_value ?? ''}–${item.max_value ?? ''} ${item.currency}` : 'Any amount';
  return item.denomination_label ?? item.denomination ?? item.product_name ?? item.product_id;
}

/** The item's fixed price in US dollars, or null for a range (which needs a quote) or a price the catalog doesn't give. */
export function fixedPriceUsd(item: CrCatalogItem): number | null {
  if (item.is_range) return null;
  const n = Number(item.price_usdc);
  return n > 0 ? n : null;
}

/** A problem with the amount typed for a range item, or null. */
export function rangeProblem(item: CrCatalogItem, value: number): string | null {
  if (!item.is_range) return null;
  if (!Number.isFinite(value) || value <= 0) return 'Enter an amount.';
  const cur = item.currency ? ` ${item.currency}` : '';
  if ((item.min_value !== undefined && value < item.min_value) || (item.max_value !== undefined && value > item.max_value)) {
    return `Enter an amount between ${item.min_value ?? 0} and ${item.max_value ?? '∞'}${cur}.`;
  }
  return null;
}

/** Who the order is for: the buyer's email, or for a phone refill the number to top up. */
export const beneficiaryFor = (kind: CrKind, email: string, phoneE164?: string): string => (kind === 'topup' ? phoneE164 ?? '' : email.trim());

export function productNameFor(item: CrCatalogItem, brand: string, productValue?: number): string {
  if (item.product_name) return item.product_name;
  const what = item.is_range ? `${productValue ?? ''} ${item.currency ?? ''}`.trim() : item.denomination_label ?? '';
  return `${brand} ${what}`.trim();
}

/** The gasless order the payment card signs and settles. */
export function buildOrder(i: { email: string; beneficiary: string; item: CrCatalogItem; productValue?: number }): CrOrderRequest {
  return {
    email: i.email.trim(),
    items: [{ beneficiary_account: i.beneficiary, product_id: i.item.product_id, ...(i.item.is_range && i.productValue !== undefined ? { product_value: i.productValue } : {}) }],
  };
}

/** The same purchase as a deposit-address order in USDC on the same rail: the card falls back to it if the gasless checkout is down. */
export function buildFallback(i: { email: string; beneficiary: string; item: CrCatalogItem; productValue?: number; country: string; rail: CrRail; methods: readonly CrPaymentMethod[] }): CrPartnerRequest | undefined {
  const want = i.rail === 'solana' ? 'solana' : 'base';
  const method = i.methods.find((m) => m.coin.toUpperCase() === 'USDC' && m.network.toLowerCase() === want);
  if (!method) return undefined;
  return {
    email: i.email.trim(),
    brand_name: i.item.brand_name,
    country_code: i.country.toUpperCase(),
    denomination: i.item.is_range ? 'range' : i.item.denomination ?? i.item.denomination_label ?? '',
    ...(i.item.is_range && i.productValue !== undefined ? { product_value: i.productValue } : {}),
    beneficiary_account: i.beneficiary,
    coin: method.coin,
    network: method.network,
  };
}
