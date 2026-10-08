/**
 * The countries the Bills providers (Bitrefill and Cryptorefills) are browsed for. Same list as the website's Bills screen
 * (bluvfi/src/components/dashboard/bills-countries.tsx), with an emoji flag instead of an image.
 */
export interface CountryEntry {
  code: string;
  name: string;
  flag: string;
  currency: string;
}

export const COUNTRIES: readonly CountryEntry[] = [
  { code: 'US', name: 'United States', flag: '🇺🇸', currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', currency: 'NGN' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', currency: 'CAD' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', currency: 'AUD' },
  { code: 'IN', name: 'India', flag: '🇮🇳', currency: 'INR' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', currency: 'EUR' },
  { code: 'FR', name: 'France', flag: '🇫🇷', currency: 'EUR' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', currency: 'EUR' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', currency: 'EUR' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', currency: 'EUR' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', currency: 'SEK' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', currency: 'BRL' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', currency: 'MXN' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', currency: 'ARS' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', currency: 'COP' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦', currency: 'ZAR' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', currency: 'KES' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', currency: 'GHS' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬', currency: 'EGP' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪', currency: 'AED' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', currency: 'SAR' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', currency: 'SGD' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', currency: 'PHP' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', currency: 'IDR' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', currency: 'JPY' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', currency: 'PKR' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', currency: 'BDT' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱', currency: 'PLN' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷', currency: 'TRY' },
];

/** The entry for a country code; the first (United States) when the code isn't in the list. */
export function getCountry(code: string | null | undefined): CountryEntry {
  return COUNTRIES.find((c) => c.code === (code ?? '').toUpperCase()) ?? COUNTRIES[0];
}

/** Countries whose name, code or currency contains the search text (all of them for an empty search). */
export function searchCountries(search: string): readonly CountryEntry[] {
  const q = search.trim().toLowerCase();
  if (!q) return COUNTRIES;
  return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.currency.toLowerCase().includes(q));
}
