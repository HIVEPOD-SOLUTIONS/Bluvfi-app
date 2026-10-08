import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { searchCountries, type CountryEntry } from '@/lib/bills-countries';

/**
 * The flag-and-currency button the Bills catalogs have in their header, and the searchable country list it opens. The list is a
 * Modal with its own FlatList, so it scrolls normally even though the button sits inside a bottom sheet.
 */
export function CountrySelector({ selected, onChange, tone = 'dark' }: { selected: CountryEntry; onChange: (c: CountryEntry) => void; tone?: 'dark' | 'light' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const countries = searchCountries(search);

  return (
    <>
      <Pressable
        onPress={() => {
          setSearch('');
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Country: ${selected.name}. Change country`}
        style={[styles.button, tone === 'light' && styles.buttonLight]}
      >
        <Text style={styles.flag}>{selected.flag}</Text>
        <Text style={[styles.currency, tone === 'light' && { color: Colors.bg0 }]}>{selected.currency}</Text>
        <Text style={[styles.caret, tone === 'light' && { color: Colors.bg0 }]}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel} onPress={() => {}}>
            <Text style={styles.title}>Choose a country</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search country…"
              placeholderTextColor={Colors.tx2}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.search}
            />
            <FlatList
              data={countries}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              ListEmptyComponent={<Text style={styles.empty}>No country matches “{search.trim()}”.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                  style={styles.item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.code === selected.code }}
                >
                  <Text style={styles.itemFlag}>{item.flag}</Text>
                  <Text style={[styles.itemName, item.code === selected.code && { color: Colors.sage }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemCurrency}>{item.currency}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.lg, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  buttonLight: { backgroundColor: 'rgba(20,21,19,0.12)', borderColor: 'rgba(20,21,19,0.18)' },
  flag: { fontSize: 16 },
  currency: { ...Type.small, color: Colors.tx0, fontFamily: Fonts.sansMedium },
  caret: { ...Type.small, color: Colors.tx1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: Spacing.xl },
  panel: { backgroundColor: Colors.bg1, borderRadius: Radii.xxxl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  title: { ...Type.h2, color: Colors.tx0 },
  search: { ...Type.body, color: Colors.tx0, backgroundColor: Colors.bg0, borderRadius: Radii.lg, paddingVertical: 10, paddingHorizontal: Spacing.lg },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 12, paddingHorizontal: Spacing.xs },
  itemFlag: { fontSize: 20 },
  itemName: { ...Type.body, color: Colors.tx0, flex: 1 },
  itemCurrency: { ...Type.small, color: Colors.tx1 },
  empty: { ...Type.small, color: Colors.tx1, textAlign: 'center', paddingVertical: Spacing.xl },
});
