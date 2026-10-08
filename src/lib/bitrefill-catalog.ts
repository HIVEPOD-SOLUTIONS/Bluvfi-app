import type { BitrefillProduct } from '@/lib/api-types';

/** The pure rules behind the Bitrefill catalog sheet (what to ask the API for, and how a product is described). */
export type CatalogTab = 'cards' | 'topup' | 'esim';
export type CardFilter = 'all' | 'entertainment' | 'gaming' | 'shopping' | 'food' | 'vpn' | 'travel';

export const CATALOG_TABS: readonly { key: CatalogTab; label: string; icon: string }[] = [
  { key: 'cards', label: 'Gift Cards', icon: '🎁' },
  { key: 'topup', label: 'Phone Refills', icon: '📱' },
  { key: 'esim', label: 'eSIM Data', icon: '🌐' },
];

/** Gift-card filters, the same set (and API categories) as the website. */
export const CARD_FILTERS: readonly { key: CardFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '⚡' },
  { key: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { key: 'gaming', label: 'Gaming', icon: '🎮' },
  { key: 'shopping', label: 'Shopping', icon: '🛍️' },
  { key: 'food', label: 'Food', icon: '🍔' },
  { key: 'vpn', label: 'Privacy', icon: '🔒' },
  { key: 'travel', label: 'Travel', icon: '✈️' },
];

export const SEARCH_PLACEHOLDER: Record<CatalogTab, string> = {
  cards: 'Search gift cards…',
  topup: 'Search carrier or country…',
  esim: 'Search eSIM plans…',
};

/** The category sent to the catalog: the section for refills and eSIMs, the chosen filter for gift cards (none for "All"). */
export function catalogCategory(tab: CatalogTab, filter: CardFilter): string | undefined {
  if (tab === 'topup' || tab === 'esim') return tab;
  return filter === 'all' ? undefined : filter;
}

/** "$5–$100", or null when the catalog search returned no pricing (the website does the same). */
export function priceRange(p: BitrefillProduct): string | null {
  const usd = (p.packages ?? []).map((k) => k.price_usd).filter((v): v is number => typeof v === 'number' && v > 0);
  if (usd.length) {
    const min = Math.min(...usd);
    const max = Math.max(...usd);
    return min === max ? `$${min}` : `$${min}–$${max}`;
  }
  if (p.range) {
    const rate = p.range.price_rate;
    if (rate) {
      const lo = (p.range.min * rate).toFixed(2);
      const hi = (p.range.max * rate).toFixed(2);
      return lo === hi ? `$${lo}` : `$${lo}–$${hi}`;
    }
    const sym = p.currency && p.currency !== 'USD' ? `${p.currency} ` : '$';
    return `${sym}${p.range.min}–${sym}${p.range.max}`;
  }
  return null;
}

export function formatCategory(category: string | undefined): string {
  return (category ?? '')
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function productSubtitle(p: BitrefillProduct, tab: CatalogTab): string {
  const kind =
    p.recipient_type === 'esim' || tab === 'esim' ? 'Data plan' : p.recipient_type === 'phone_number' || tab === 'topup' ? 'Mobile top-up' : formatCategory(p.category);
  return p.currency ? `${kind} · ${p.currency}` : kind;
}

export function buyVerb(p: BitrefillProduct, tab: CatalogTab): string {
  return p.recipient_type === 'phone_number' || tab === 'topup' ? 'Refill' : p.recipient_type === 'esim' || tab === 'esim' ? 'Get Plan' : 'Buy';
}
