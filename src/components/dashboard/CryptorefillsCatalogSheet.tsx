import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useApiQuery } from '@/hooks/use-api';
import { useBillsCountry } from '@/lib/bills-country';
import { categoryEmoji, prettyCategory, visibleBrands, type CrBrand, type CrCardCategory, type CrKind } from '@/lib/cryptorefills-categories';
import { CountrySelector } from './CountrySelector';
import { EmptyState, FilterChips, Logo, ProductRow, RowSkeletons, SearchBox, SummaryCard, TabPills } from './CatalogParts';

type CardFilter = 'all' | CrCardCategory;

const TABS: readonly { key: CrKind; label: string; icon: string }[] = [
  { key: 'cards', label: 'Gift Cards', icon: '🎁' },
  { key: 'topup', label: 'Phone Refills', icon: '📱' },
  { key: 'esim', label: 'eSIM Data', icon: '🌐' },
];

const CARD_FILTERS: readonly { key: CardFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '⚡' },
  { key: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { key: 'gaming', label: 'Gaming', icon: '🎮' },
  { key: 'shopping', label: 'Shopping', icon: '🛍️' },
  { key: 'food', label: 'Food', icon: '🍔' },
  { key: 'vpn', label: 'Privacy', icon: '🔒' },
  { key: 'travel', label: 'Travel', icon: '✈️' },
];

/** The most brands drawn at once (the catalogue has thousands; searching narrows it). */
const MAX_ROWS = 120;

const PLACEHOLDER: Record<CrKind, string> = { cards: 'Search brands…', topup: 'Search carrier…', esim: 'Search eSIM plans…' };

interface CryptorefillsCatalogSheetProps {
  open: boolean;
  onClose: () => void;
  /** Hand a brand to the AI assistant, which creates the order and shows the payment card. */
  onBuy: (brand: CrBrand, kind: CrKind, countryName: string) => void;
}

/**
 * Cryptorefills catalog (gift cards, phone refills, eSIMs in 180 countries) from bluvfi's `/api/cryptorefills/brands`, laid out like the
 * website. Paid in USDC on Base or Solana with no gas; the purchase itself runs in the chat so the payment card can confirm it.
 */
export function CryptorefillsCatalogSheet({ open, onClose, onBuy }: CryptorefillsCatalogSheetProps) {
  const [country, setCountry] = useBillsCountry();
  const [tab, setTab] = useState<CrKind>('cards');
  const [filter, setFilter] = useState<CardFilter>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useApiQuery<{ brands: CrBrand[] }>(
    ['cryptorefills-brands', country.code],
    '/api/cryptorefills/brands',
    { country: country.code.toLowerCase() },
    { enabled: open, retry: 1, staleTime: 5 * 60_000 },
  );
  const brands = data?.brands;
  const visible = useMemo(() => visibleBrands(brands ?? [], { kind: tab, cardFilter: filter, query: search }), [brands, tab, filter, search]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Cryptorefills" snapPoints={['92%']} scrollable>
      <SummaryCard
        label="Cryptorefills"
        headline={isLoading ? '… brands' : `${brands?.length ?? 0} brands`}
        detail={`${country.flag} ${country.name} · Pay with USDC · No gas`}
        selector={<CountrySelector selected={country} onChange={setCountry} tone="light" />}
      />

      <TabPills
        items={TABS}
        active={tab}
        onChange={(t) => {
          setTab(t);
          setFilter('all');
          setSearch('');
        }}
      />
      {tab === 'cards' ? (
        <FilterChips
          items={CARD_FILTERS}
          active={filter}
          onChange={(f) => {
            setFilter(f);
            setSearch('');
          }}
        />
      ) : null}
      <SearchBox value={search} onChangeText={setSearch} placeholder={PLACEHOLDER[tab]} />

      {isLoading ? (
        <RowSkeletons />
      ) : isError ? (
        <EmptyState icon="⚠️" message="Couldn't load products." action="Try again" onAction={() => refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState icon="🔍" message={search.trim() ? `No results for “${search.trim()}”` : `Nothing in this section for ${country.name} yet`} />
      ) : (
        <View style={{ gap: Spacing.sm }}>
          {visible.slice(0, MAX_ROWS).map((b) => (
            <ProductRow
              key={b.brand_name}
              logo={<Logo uri={b.logo_url} emoji={categoryEmoji(b.category)} background={b.bg_color ?? '#2A2B27'} fit="contain" />}
              title={b.brand_name}
              subtitle={`${prettyCategory(b.category)}${b.min && b.max ? ` · ${b.min} – ${b.max}` : ''}`}
            >
              <Pressable onPress={() => onBuy(b, tab, country.name)} accessibilityRole="button" style={styles.buy}>
                <Text style={styles.buyText}>{tab === 'topup' ? 'Refill' : tab === 'esim' ? 'Get plan' : 'Buy'}</Text>
              </Pressable>
            </ProductRow>
          ))}
          {visible.length > MAX_ROWS ? <Text style={styles.more}>Showing {MAX_ROWS} of {visible.length}. Search to narrow it down.</Text> : null}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  buy: { backgroundColor: 'rgba(143,174,130,0.15)', borderRadius: Radii.lg, paddingVertical: 7, paddingHorizontal: Spacing.md },
  buyText: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.sage },
  more: { ...Type.small, color: Colors.tx2, textAlign: 'center', paddingVertical: Spacing.md },
});
