import { useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';

/**
 * The pieces the Bitrefill and the Cryptorefills catalogs share, laid out like the website's Bills screen: a sage summary card with the
 * country button, section pills, gift-card filter chips, a search box and product rows with a logo. The two horizontal rows use the
 * gesture-handler ScrollView so they scroll sideways inside a bottom sheet (a plain ScrollView doesn't on Android).
 */

export function SummaryCard({ label, headline, detail, action, selector }: { label: string; headline: string; detail: string; action?: ReactNode; selector: ReactNode }) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>{label}</Text>
          <Text style={styles.summaryHeadline}>{headline}</Text>
        </View>
        {selector}
      </View>
      <Text style={styles.summaryDetail}>{detail}</Text>
      {action}
    </View>
  );
}

export function SummaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.summaryButton}>
      <Text style={styles.summaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function TabPills<T extends string>({ items, active, onChange }: { items: readonly { key: T; label: string; icon: string }[]; active: T; onChange: (key: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} style={styles.rowScroll}>
      {items.map((t) => {
        const on = t.key === active;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.pill, on && styles.pillOn]}>
            <Text style={[styles.pillText, on && styles.pillTextOn]}>
              {t.icon} {t.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function FilterChips<T extends string>({ items, active, onChange }: { items: readonly { key: T; label: string; icon: string }[]; active: T; onChange: (key: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.rowScroll}>
      {items.map((c) => {
        const on = c.key === active;
        return (
          <Pressable key={c.key} onPress={() => onChange(c.key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>
              {c.icon} {c.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SearchBox({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder: string }) {
  return (
    <View style={styles.search}>
      <Text style={styles.searchIcon}>🔍</Text>
      <BottomSheetTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.tx2}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.searchInput}
      />
    </View>
  );
}

/** A product or brand logo (its image, on its own colour when it has one), or an emoji if there is none or it fails to load. */
export function Logo({ uri, emoji, background, fit = 'contain', size = 44 }: { uri?: string; emoji: string; background?: string; fit?: 'contain' | 'cover'; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.logo, { width: size, height: size }, background ? { backgroundColor: background } : null]}>
      {uri && !failed ? (
        <Image source={{ uri }} style={[styles.logoImage, fit === 'contain' && { padding: 4 }]} resizeMode={fit} onError={() => setFailed(true)} />
      ) : (
        <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>
      )}
    </View>
  );
}

export function ProductRow({ logo, title, subtitle, children }: { logo: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      {logo}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function RowSkeletons({ count = 5 }: { count?: number }) {
  return (
    <View style={{ gap: Spacing.sm }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.row, { height: 74, opacity: 0.55 }]} />
      ))}
    </View>
  );
}

export function EmptyState({ icon, message, action, onAction }: { icon: string; message: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 26 }}>{icon}</Text>
      <Text style={styles.emptyText}>{message}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button">
          <Text style={styles.emptyAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: Colors.sage, borderRadius: Radii.xxxl, padding: Spacing.xl, marginBottom: Spacing.md },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  summaryLabel: { ...Type.small, color: 'rgba(20,21,19,0.7)', fontFamily: Fonts.sansMedium },
  summaryHeadline: { fontFamily: Fonts.sansBold, fontSize: 28, color: '#141513', marginTop: 2 },
  summaryDetail: { ...Type.small, color: 'rgba(20,21,19,0.6)', marginTop: 2 },
  summaryButton: { alignSelf: 'flex-start', backgroundColor: 'rgba(20,21,19,0.18)', borderRadius: Radii.lg, paddingVertical: 8, paddingHorizontal: Spacing.lg, marginTop: Spacing.lg },
  summaryButtonText: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: '#141513' },
  rowScroll: { flexGrow: 0, marginBottom: Spacing.sm },
  pills: { gap: Spacing.sm, paddingRight: Spacing.lg },
  pill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  pillOn: { backgroundColor: Colors.tx0 },
  pillText: { ...Type.small, color: Colors.tx1, fontFamily: Fonts.sansMedium },
  pillTextOn: { color: Colors.bg0 },
  chips: { gap: Spacing.sm, paddingRight: Spacing.lg },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'transparent' },
  chipOn: { backgroundColor: 'rgba(143,174,130,0.2)', borderColor: 'rgba(143,174,130,0.4)' },
  chipText: { ...Type.small, fontSize: 12, color: Colors.tx1, fontFamily: Fonts.sansMedium },
  chipTextOn: { color: Colors.sage },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.xxl, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  searchIcon: { fontSize: 14, marginRight: Spacing.sm, opacity: 0.7 },
  searchInput: { ...Type.body, flex: 1, color: Colors.tx0, paddingVertical: 11 },
  logo: { borderRadius: Radii.lg, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.xxl, padding: Spacing.lg },
  rowTitle: { ...Type.h3, color: Colors.tx0 },
  rowSub: { ...Type.small, color: Colors.tx1, marginTop: 2 },
  empty: { alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.xxl, padding: Spacing.xxxl },
  emptyText: { ...Type.small, color: Colors.tx1, textAlign: 'center' },
  emptyAction: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline', marginTop: Spacing.xs },
});
