import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useApiQuery } from '@/hooks/use-api';
import type { BitrefillProduct } from '@/lib/api-types';
import { bitrefillLogoUrl, productEmoji } from '@/lib/bills-logos';
import {
  CARD_FILTERS,
  CATALOG_TABS,
  SEARCH_PLACEHOLDER,
  buyVerb,
  catalogCategory,
  priceRange,
  productSubtitle,
  type CardFilter,
  type CatalogTab,
} from '@/lib/bitrefill-catalog';
import { useBillsCountry } from '@/lib/bills-country';
import { CountrySelector } from './CountrySelector';
import { EmptyState, FilterChips, Logo, ProductRow, RowSkeletons, SearchBox, SummaryButton, SummaryCard, TabPills } from './CatalogParts';

interface BitrefillCatalogSheetProps {
  open: boolean;
  onClose: () => void;
  /** How many digital products the user has bought (shown on the summary card). */
  purchasedCount: number;
  onAskAi: () => void;
  /** Hand a product to the AI assistant to complete the purchase. */
  onBuy: (product: BitrefillProduct, tab: CatalogTab, countryName: string) => void;
}

/** Bitrefill catalog (gift cards, phone refills, eSIM data) from bluvfi's `/api/bitrefill/products`, laid out like the website. */
export function BitrefillCatalogSheet({ open, onClose, purchasedCount, onAskAi, onBuy }: BitrefillCatalogSheetProps) {
  const [country, setCountry] = useBillsCountry();
  const [tab, setTab] = useState<CatalogTab>('cards');
  const [filter, setFilter] = useState<CardFilter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  // Debounce typing so each keystroke doesn't hit the catalog.
  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(id);
  }, [search]);

  const category = catalogCategory(tab, filter);
  const { data, isLoading, isError, refetch } = useApiQuery<{ data: BitrefillProduct[] }>(
    ['bitrefill-products', country.code, tab, category ?? 'all', query],
    '/api/bitrefill/products',
    { limit: 40, country: country.code, category, q: query || undefined },
    { enabled: open, retry: 1 },
  );
  const products = data?.data ?? [];

  return (
    <BottomSheet open={open} onClose={onClose} title="Bitrefill" snapPoints={['92%']} scrollable>
      <SummaryCard
        label="Digital Products"
        headline={`${purchasedCount} purchased`}
        detail={`10,000+ products · ${country.flag} ${country.name} · ${country.currency}`}
        selector={<CountrySelector selected={country} onChange={setCountry} tone="light" />}
        action={<SummaryButton label="Ask AI to find products" onPress={onAskAi} />}
      />

      <TabPills
        items={CATALOG_TABS}
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
      <SearchBox value={search} onChangeText={setSearch} placeholder={SEARCH_PLACEHOLDER[tab]} />

      {isLoading ? (
        <RowSkeletons />
      ) : isError ? (
        <EmptyState icon="⚠️" message="Couldn't reach the product catalog." action="Try again" onAction={() => refetch()} />
      ) : products.length === 0 ? (
        <EmptyState icon="🔍" message={query ? `No results for “${query}”` : `Nothing in this section for ${country.name} yet`} />
      ) : (
        <View style={{ gap: Spacing.sm }}>
          {products.map((p) => (
            <ProductRow
              key={p.id}
              logo={<Logo uri={bitrefillLogoUrl(p)} emoji={productEmoji(tab)} />}
              title={p.name}
              subtitle={productSubtitle(p, tab)}
            >
              {p.in_stock === false ? (
                <Text style={styles.outOfStock}>Out of stock</Text>
              ) : (
                <View style={styles.action}>
                  {priceRange(p) ? <Text style={styles.price}>{priceRange(p)}</Text> : null}
                  <Pressable onPress={() => onBuy(p, tab, country.name)} accessibilityRole="button" style={styles.buy}>
                    <Text style={styles.buyText}>{buyVerb(p, tab)}</Text>
                  </Pressable>
                </View>
              )}
            </ProductRow>
          ))}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'flex-end', gap: 4 },
  price: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  buy: { backgroundColor: Colors.sage, borderRadius: Radii.lg, paddingVertical: 5, paddingHorizontal: Spacing.md },
  buyText: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.bg0 },
  outOfStock: { ...Type.small, color: Colors.tx2, backgroundColor: Colors.bg2, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' },
});
