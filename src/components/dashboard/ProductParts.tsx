import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type KeyboardTypeOptions } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';

/** The small pieces the product pages and checkouts of both providers share. */

/** A titled block that opens and closes (description, how to redeem, reviews, terms). */
export function Section({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.section}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.chevron}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

/** A choice chip: a denomination, a payment method. */
export function Chip({ label, sub, selected, onPress, disabled }: { label: string; sub?: string; selected?: boolean; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={[styles.chip, selected && styles.chipSelected, disabled && { opacity: 0.4 }]}
    >
      <Text style={[styles.chipLabel, selected && { color: Colors.bg0 }]}>{label}</Text>
      {sub ? <Text style={[styles.chipSub, selected && { color: Colors.bg0 }]}>{sub}</Text> : null}
    </Pressable>
  );
}

/** A passive tag (an accepted payment method). */
export function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

/** A labelled text field that works inside a bottom sheet (the keyboard doesn't cover it). */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  keyboardType,
  autoCapitalize = 'none',
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <BottomSheetTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.tx2}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={[styles.input, error ? { borderColor: Colors.redAlert } : null]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Stars({ value, count }: { value: number; count?: number }) {
  return (
    <Text style={styles.stars}>
      <Text style={{ color: Colors.gold }}>★</Text> {value.toFixed(1)}
      {count !== undefined ? <Text style={{ color: Colors.tx2 }}> ({count})</Text> : null}
    </Text>
  );
}

/** One line of the order summary. */
export function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, strong && { fontFamily: Fonts.monoBold }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: 14 },
  sectionTitle: { ...Type.h3, color: Colors.tx0 },
  chevron: { ...Type.h3, color: Colors.tx1 },
  sectionBody: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.sm },
  chip: { backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, paddingVertical: 10, paddingHorizontal: 14, minWidth: 72, alignItems: 'center' },
  chipSelected: { backgroundColor: Colors.sage, borderColor: Colors.sage },
  chipLabel: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  chipSub: { ...Type.small, fontSize: 11, color: Colors.tx2 },
  tag: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: 'rgba(242,240,232,0.04)', paddingVertical: 4, paddingHorizontal: 10 },
  tagText: { ...Type.small, color: Colors.tx1 },
  fieldLabel: { ...Type.label, color: Colors.tx2 },
  input: { backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, color: Colors.tx0, paddingHorizontal: Spacing.lg, paddingVertical: 12, fontFamily: Fonts.sansRegular, fontSize: 16 },
  error: { ...Type.small, color: Colors.redAlert },
  hint: { ...Type.small, color: Colors.tx2 },
  stars: { ...Type.small, color: Colors.tx1 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.lg },
  summaryLabel: { ...Type.small, color: Colors.tx2 },
  summaryValue: { ...Type.small, color: Colors.tx0, textAlign: 'right', flexShrink: 1 },
});
