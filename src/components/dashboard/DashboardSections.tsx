import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import type { Payment } from '@/lib/api-types';
import { BITREFILL_OFFICIAL_LOGO, CRYPTOREFILLS_LOGO } from '@/lib/bills-logos';
import { PurchaseRow } from './PurchaseRow';

/**
 * The four dashboard tabs (Bills / Invest / Banking / History). They render plain lists (no nested
 * FlatList) because Home scrolls them inside its own ScrollView; any bottom sheets they open are
 * owned by Home and triggered through the callbacks here.
 */

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

interface BillsSectionProps {
  /** Completed digital-product purchases, from `/api/payments?type=bill` (includes ones the AI made). */
  purchasedCount: number;
  loading: boolean;
  /** Bill payments, newest first (any status); the latest few are listed under "My Bills". */
  purchases: Payment[];
  onViewAll: () => void;
  onAskAi: () => void;
  onOpenBitrefill: () => void;
  onOpenCryptorefills: () => void;
  /** A tap on a purchase opens its details. */
  onOpenPurchase: (payment: Payment) => void;
}

const RECENT_PURCHASES = 3;

/** Bills tab, as on the web: purchase summary, then "My Bills" / "Browse" (provider catalogs). */
export function BillsSection({ purchasedCount, loading, purchases, onViewAll, onAskAi, onOpenBitrefill, onOpenCryptorefills, onOpenPurchase }: BillsSectionProps) {
  const [view, setView] = useState<'bills' | 'browse'>('bills');

  return (
    <View style={styles.list}>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Digital Products</Text>
        <View style={styles.heroCountRow}>
          <Text style={styles.heroCount}>{loading ? '…' : purchasedCount}</Text>
          <Text style={styles.heroCountSuffix}>purchased</Text>
        </View>
        <Text style={styles.heroSub}>Gift cards · Mobile top-ups · eSIM data plans</Text>
        <View style={{ marginTop: Spacing.lg }}>
          <Button onPress={onAskAi}>Ask AI to find products</Button>
        </View>
      </View>

      <View style={styles.toggle}>
        {(['bills', 'browse'] as const).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} style={[styles.toggleButton, view === v && styles.toggleButtonActive]}>
            <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>
              {v === 'bills' ? 'My Bills' : 'Browse'}
            </Text>
          </Pressable>
        ))}
      </View>

      {view === 'bills' &&
        (loading ? (
          <EmptyState text="Loading…" />
        ) : purchases.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 36 }}>🧾</Text>
            <Text style={styles.emptyTitle}>No purchases yet</Text>
            <Text style={styles.emptyText}>Browse digital products to get started</Text>
            <View style={{ height: Spacing.md }} />
            <Button onPress={() => setView('browse')}>Browse Products</Button>
          </View>
        ) : (
          <View style={styles.list}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentLabel}>Recent purchases</Text>
              <Pressable onPress={onViewAll} hitSlop={8} style={styles.viewAll}>
                <Text style={styles.viewAllText}>View all</Text>
                <Text style={styles.viewAllText}>›</Text>
              </Pressable>
            </View>
            {purchases.slice(0, RECENT_PURCHASES).map((p) => (
              <PurchaseRow key={p.id} payment={p} onPress={() => onOpenPurchase(p)} />
            ))}
          </View>
        ))}

      {view === 'browse' && (
        <View style={styles.list}>
          <Pressable onPress={onOpenBitrefill} accessibilityRole="button" accessibilityLabel="Open Bitrefill" style={styles.provider}>
            <Image source={{ uri: BITREFILL_OFFICIAL_LOGO }} style={styles.providerLogo} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <View style={styles.providerNameRow}>
                <Text style={styles.rowTitle}>Bitrefill</Text>
                <Text style={styles.badgeGrey}>Digital Products</Text>
                <Text style={styles.badgeGreen}>USDC</Text>
              </View>
              <Text style={styles.rowSub} numberOfLines={2}>Gift cards, mobile top-ups & eSIM data plans — 10,000+ products worldwide</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable onPress={onOpenCryptorefills} accessibilityRole="button" accessibilityLabel="Open Cryptorefills" style={styles.provider}>
            <Image source={{ uri: CRYPTOREFILLS_LOGO }} style={styles.providerLogo} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <View style={styles.providerNameRow}>
                <Text style={styles.rowTitle}>Cryptorefills</Text>
                <Text style={styles.badgeGrey}>Digital Products</Text>
                <Text style={styles.badgeGreen}>USDC · No gas</Text>
              </View>
              <Text style={styles.rowSub} numberOfLines={2}>Gift cards, mobile top-ups & eSIMs — 10,000+ brands in 180 countries</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function BankingSection() {
  return (
    <View style={styles.soon}>
      <Text style={styles.soonIcon}>🏦</Text>
      <Text style={styles.soonTitle}>Banking is coming soon</Text>
      <Text style={styles.emptyText}>Add funds and withdraw to your bank, right from the app. We'll let you know when it's ready.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  soon: {
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xxl,
    padding: Spacing.xxxl,
  },
  soonIcon: { fontSize: 40 },
  soonTitle: { ...Type.h2, color: Colors.tx0 },
  list: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg1,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  rowIcon: {
    fontSize: 20,
  },
  rowTitle: {
    ...Type.h3,
    color: Colors.tx0,
  },
  rowSub: {
    ...Type.small,
    color: Colors.tx1,
    marginTop: 2,
  },
  rowAmount: {
    ...Type.body,
    fontFamily: Type.amount.fontFamily,
    color: Colors.tx0,
  },
  // Design system card: BG-1 surface, 16px radius, sage-tinted border (--bd-sage). Sage is for
  // positive/success text, not a filled surface.
  hero: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.borderSage,
    borderRadius: Radii.xxl,
    padding: Spacing.xl,
  },
  heroLabel: {
    ...Type.label,
    fontSize: 12,
    // TX-2 (#6B6B62) is too faint for this size on a BG-1 card; TX-1 keeps the caps legible.
    color: Colors.tx1,
  },
  heroCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  heroCount: {
    ...Type.amount,
    fontSize: 32,
    lineHeight: 40,
    color: Colors.tx0,
  },
  heroCountSuffix: {
    ...Type.body,
    color: Colors.sage,
  },
  heroSub: {
    ...Type.small,
    color: Colors.tx1,
    marginTop: 2,
  },
  toggle: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  toggleButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: 999,
    backgroundColor: Colors.bg2,
  },
  toggleButtonActive: {
    backgroundColor: Colors.blue,
  },
  toggleText: {
    ...Type.body,
    color: Colors.tx1,
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  recentLabel: {
    ...Type.label,
    fontSize: 12,
    color: Colors.tx1,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bg2,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: Spacing.md,
  },
  viewAllText: {
    ...Type.small,
    color: Colors.tx0,
  },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  providerLogo: {
    width: 44,
    height: 44,
    borderRadius: Radii.lg,
    backgroundColor: 'rgba(242,240,232,0.06)',
  },
  providerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgeGrey: {
    ...Type.small,
    fontSize: 11,
    color: Colors.tx1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  badgeGreen: {
    ...Type.small,
    fontSize: 11,
    color: '#4ADE80',
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  chevron: {
    ...Type.h1,
    color: Colors.tx1,
  },
  emptyTitle: {
    ...Type.h3,
    color: Colors.tx0,
    marginTop: Spacing.sm,
  },
  empty: {
    alignItems: 'center',
    padding: Spacing.xxxl,
  },
  emptyText: {
    ...Type.body,
    color: Colors.tx1,
    textAlign: 'center',
  },
});
