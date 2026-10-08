/**
 * How Cryptorefills brands are grouped. Same rules as the website and the AI tools (bluvfi/src/lib/cryptorefills-categories.ts), so the
 * app, the website and the assistant all filter the catalogue the same way.
 */

/** A catalog brand from `/api/cryptorefills/brands`. */
export interface CrBrand {
  brand_name: string;
  family: string;
  category: string;
  min?: string;
  max?: string;
  /** Official logo and the brand colour it sits on. */
  logo_url?: string;
  bg_color?: string;
}

/** Top-level sections: gift cards, phone refills, eSIMs. */
export type CrKind = 'cards' | 'topup' | 'esim';

/** Gift-card sub-filters, the same set as the Bitrefill browser. */
export type CrCardCategory = 'entertainment' | 'gaming' | 'shopping' | 'food' | 'vpn' | 'travel';

export function kindOf(category: string): CrKind | null {
  if (category === 'e-sim') return 'esim';
  if (category.startsWith('mobile_')) return 'topup';
  if (category === 'e-money') return null; // needs a Cryptorefills whitelabel account
  return 'cards';
}

// Cryptorefills has no privacy category: VPNs and password managers are filed under "electronics".
const PRIVACY_RE = /vpn|nordpass|proton|surfshark|mullvad|cyberghost|ivacy|1password|bitwarden|dashlane|keeper|incogni/i;

export function cardCategoryOf(brand: { brand_name: string; category: string }): CrCardCategory | null {
  if (PRIVACY_RE.test(brand.brand_name)) return 'vpn';
  switch (brand.category) {
    case 'entertainment':
    case 'streaming':
      return 'entertainment';
    case 'games':
      return 'gaming';
    case 'food':
    case 'groceries':
      return 'food';
    case 'travel_flights':
      return 'travel';
    case 'e-commerce':
    case 'retail':
    case 'apparel_clothing':
    case 'electronics':
    case 'home':
    case 'health_beauty':
    case 'sports_fitness':
      return 'shopping';
    default:
      return null; // e.g. charity: only under "All"
  }
}

/** The catalogue repeats some brands (NordPass appears three times); keep the first of each name. */
export function dedupeBrands<T extends { brand_name: string }>(brands: readonly T[]): T[] {
  const seen = new Set<string>();
  return brands.filter((b) => (seen.has(b.brand_name) ? false : (seen.add(b.brand_name), true)));
}

const CATEGORY_EMOJI: Record<string, string> = {
  'e-sim': '📡', 'e-commerce': '🛒', retail: '🛍️', food: '🍔', groceries: '🥦', apparel_clothing: '👕',
  entertainment: '🎬', streaming: '📺', games: '🎮', electronics: '💻', travel_flights: '✈️', home: '🏠',
  health_beauty: '💄', sports_fitness: '🏋️', charity_donations: '💚',
  mobile_talk_time: '📞', mobile_credits: '📱', mobile_data: '📶', mobile_bundle: '📦',
};

export const categoryEmoji = (category: string): string => CATEGORY_EMOJI[category] ?? '🎁';

export const prettyCategory = (c: string): string => c.replace(/[_-]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

/** The brands to list for a section and search: the right kind, the right gift-card filter, matching the search, each brand once. */
export function visibleBrands(
  brands: readonly CrBrand[],
  opts: { kind: CrKind; cardFilter: 'all' | CrCardCategory; query: string },
): CrBrand[] {
  const q = opts.query.trim().toLowerCase();
  return dedupeBrands(
    brands.filter(
      (b) =>
        kindOf(b.category) === opts.kind &&
        (opts.kind !== 'cards' || opts.cardFilter === 'all' || cardCategoryOf(b) === opts.cardFilter) &&
        (!q || b.brand_name.toLowerCase().includes(q) || b.category.includes(q)),
    ),
  );
}
