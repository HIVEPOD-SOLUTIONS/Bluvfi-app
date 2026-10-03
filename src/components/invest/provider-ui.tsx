import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';

/** Small building blocks shared by the Nosana, GetEquity and Doma sheets. */

export function SegTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  return (
    <View style={s.seg}>
      {tabs.map((t) => (
        <Pressable key={t.key} onPress={() => onChange(t.key)} style={[s.segItem, value === t.key && s.segActive]}>
          <Text style={[s.segText, value === t.key && { color: Colors.tx0 }]} numberOfLines={1}>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Chips<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
      {items.map((i) => (
        <Pressable key={i.key} onPress={() => onChange(i.key)} style={[s.chip, value === i.key && s.chipActive]}>
          <Text style={[s.chipText, value === i.key && { color: '#FFFFFF' }]}>{i.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Pill({ label, color = Colors.tx1, bg = 'rgba(242,240,232,0.06)' }: { label: string; color?: string; bg?: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  multiline,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
  multiline?: boolean;
  optional?: boolean;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.fieldLabel}>
        {label}
        {optional ? ' (optional)' : ''}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.tx2}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        style={[s.input, multiline && { minHeight: 90, textAlignVertical: 'top', fontFamily: Fonts.mono, fontSize: 12 }]}
      />
    </View>
  );
}

/** Pick one of a few options (replaces the web's <select>). */
export function OptionPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        {options.map((o) => (
          <Pressable key={o} onPress={() => onChange(o)} style={[s.chip, value === o && s.chipActive]}>
            <Text style={[s.chipText, value === o && { color: '#FFFFFF' }]}>{o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Spinner() {
  return <ActivityIndicator color={Colors.sage} style={{ marginVertical: Spacing.xxxl }} />;
}

export function ErrorText({ message }: { message: string }) {
  return <Text style={s.error}>{message}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={s.muted}>{children}</Text>;
}

/** Raw JSON response, shown the way the web's developer consoles show it. */
export function ResultBox({ result, error }: { result: unknown; error: string | null }) {
  if (!error && result == null) return null;
  return (
    <Card>
      <Text style={s.cardTitle}>{error ? 'Error' : 'Result'}</Text>
      <Text selectable style={[s.mono, error ? { color: Colors.redAlert } : null]}>
        {error ?? JSON.stringify(result, null, 2)}
      </Text>
    </Card>
  );
}

export const providerStyles = StyleSheet.create({
  stack: { gap: Spacing.md },
  cardTitle: { ...Type.h3, color: Colors.tx0 },
  muted: { ...Type.small, color: Colors.tx1 },
});

const s = StyleSheet.create({
  seg: { flexDirection: 'row', gap: 4, backgroundColor: 'rgba(242,240,232,0.04)', borderRadius: Radii.lg, padding: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radii.md },
  segActive: { backgroundColor: Colors.bg2 },
  segText: { ...Type.small, fontFamily: Fonts.sansMedium, color: Colors.tx1 },
  chip: { borderRadius: 999, backgroundColor: Colors.bg2, paddingVertical: 7, paddingHorizontal: Spacing.md },
  chipActive: { backgroundColor: Colors.blue },
  chipText: { ...Type.small, color: Colors.tx1 },
  card: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardTitle: { ...Type.h3, color: Colors.tx0 },
  pill: { borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start' },
  pillText: { ...Type.small, fontSize: 11, fontFamily: Fonts.sansMedium },
  fieldLabel: { ...Type.small, fontFamily: Fonts.sansMedium, color: Colors.tx1 },
  input: {
    ...Type.body,
    color: Colors.tx0,
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.lg,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  error: { ...Type.body, color: Colors.redAlert, textAlign: 'center', paddingVertical: Spacing.lg },
  muted: { ...Type.body, color: Colors.tx1, textAlign: 'center', paddingVertical: Spacing.lg },
  mono: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 16, color: Colors.tx0 },
});
