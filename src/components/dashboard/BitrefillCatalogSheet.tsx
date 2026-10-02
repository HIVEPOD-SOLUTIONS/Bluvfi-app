import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useApiQuery } from '@/hooks/use-api';
import type { BitrefillProduct } from '@/lib/api-types';

type CatalogTab = 'cards' | 'topup' | 'esim';

const TABS: { key: CatalogTab; label: string; icon: string; category?: string }[] = [
  { key: 'cards', label: 'Gift Cards', icon: '🎁' },
  { key: 'topup', label: 'Phone Refills', icon: '📱', category: 'topup' },
  { key: 'esim', label: 'eSIM Data', icon: '🌐', category: 'esim' },
];

const PLACEHOLDER: Record<CatalogTab, string> = {
  cards: 'Search gift cards…',
  topup: 'Search carrier or country…',
  esim: 'Search eSIM plans…',
};

/** "$5–$100", or null when the catalog search returned no pricing (the web does the same). */
function priceRange(p: BitrefillProduct): string | null {
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

function formatCategory(category: string): string {
  return (category ?? '')
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function subtitle(p: BitrefillProduct, tab: CatalogTab): string {
  const kind =
    p.recipient_type === 'esim' || tab === 'esim'
      ? 'Data plan'
      : p.recipient_type === 'phone_number' || tab === 'topup'
        ? 'Mobile top-up'
        : formatCategory(p.category);
  return p.currency ? `${kind} · ${p.currency}` : kind;
}

function ProductRow({ product, tab, onBuy }: { product: BitrefillProduct; tab: CatalogTab; onBuy: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const price = priceRange(product);
  const verb = product.recipient_type === 'phone_number' || tab === 'topup' ? 'Refill' : tab === 'esim' ? 'Get Plan' : 'Buy';

  return (
    <View style={styles.row}>
      <View style={styles.logo}>
        {product.logo_url && !imgFailed ? (
          <Image
            source={{ uri: product.logo_url }}
            style={styles.logoImage}
            resizeMode="contain"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <Text style={{ fontSize: 20 }}>{tab === 'esim' ? '📡' : tab === 'topup' ? '📱' : '🎁'}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {subtitle(product, tab)}
        </Text>
      </View>
      {product.in_stock === false ? (
        <Text style={styles.outOfStock}>Out of stock</Text>
      ) : (
        <View style={styles.action}>
          {price && <Text style={styles.price}>{price}</Text>}
          <Pressable onPress={onBuy} style={styles.buy}>
            <Text style={styles.buyText}>{verb}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

interface BitrefillCatalogSheetProps {
  open: boolean;
  onClose: () => void;
  /** Hand a product to the AI assistant to complete the purchase. */
  onBuy: (product: BitrefillProduct, tab: CatalogTab) => void;
}

/** Bitrefill catalog (gift cards, phone refills, eSIM data) from bluvfi's `/api/bitrefill/products`. */
export function BitrefillCatalogSheet({ open, onClose, onBuy }: BitrefillCatalogSheetProps) {
  const [tab, setTab] = useState<CatalogTab>('cards');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  // Debounce typing so each keystroke doesn't hit the catalog.
  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(id);
  }, [search]);

  const category = TABS.find((t) => t.key === tab)?.category;
  const { data, isLoading, isError, refetch } = useApiQuery<{ data: BitrefillProduct[] }>(
    ['bitrefill-products', tab, query],
    '/api/bitrefill/products',
    { limit: 40, country: 'US', category, q: query || undefined },
    { enabled: open, retry: 1 },
  );
  const products = data?.data ?? [];

  return (
    <BottomSheet open={open} onClose={onClose} title="Bitrefill" snapPoints={['90%']} scrollable>
      <Text style={styles.subtitle}>Gift cards, mobile top-ups & eSIM data plans.</Text>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => {
              setTab(t.key);
              setSearch('');
            }}
            style={[styles.tab, tab === t.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.icon} {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <BottomSheetTextInput
        value={search}
        onChangeText={setSearch}
        placeholder={PLACEHOLDER[tab]}
        placeholderTextColor={Colors.tx2}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.search}
      />

      {isLoading ? (
        <Text style={styles.message}>Loading products…</Text>
      ) : isError ? (
        <Pressable onPress={() => refetch()}>
          <Text style={styles.message}>Couldn't reach the product catalog. Tap to retry.</Text>
        </Pressable>
      ) : products.length === 0 ? (
        <Text style={styles.message}>{query ? `No results for "${query}"` : 'No products found.'}</Text>
      ) : (
        <View style={{ gap: Spacing.sm }}>
          {products.map((p) => (
            <ProductRow key={p.id} product={p} tab={tab} onBuy={() => onBuy(p, tab)} />
          ))}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...Type.body,
    color: Colors.tx1,
    marginBottom: Spacing.lg,
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: 999,
    backgroundColor: Colors.bg2,
  },
  tabActive: {
    backgroundColor: Colors.blue,
  },
  tabText: {
    ...Type.small,
    color: Colors.tx1,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  search: {
    ...Type.body,
    color: Colors.tx0,
    backgroundColor: Colors.bg0,
    borderRadius: Radii.xl,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  message: {
    ...Type.body,
    color: Colors.tx1,
    textAlign: 'center',
    paddingVertical: Spacing.xxxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg0,
    borderRadius: Radii.xl,
    padding: Spacing.md,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: Radii.lg,
    backgroundColor: 'rgba(242,240,232,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  name: {
    ...Type.h3,
    color: Colors.tx0,
  },
  sub: {
    ...Type.small,
    color: Colors.tx1,
    marginTop: 2,
  },
  action: {
    alignItems: 'flex-end',
    gap: 4,
  },
  price: {
    ...Type.small,
    fontFamily: Type.h3.fontFamily,
    color: Colors.tx0,
  },
  buy: {
    backgroundColor: Colors.sage,
    borderRadius: Radii.md,
    paddingVertical: 4,
    paddingHorizontal: Spacing.md,
  },
  buyText: {
    ...Type.small,
    fontFamily: Type.h3.fontFamily,
    color: Colors.bg0,
  },
  outOfStock: {
    ...Type.small,
    color: Colors.tx2,
  },
});
