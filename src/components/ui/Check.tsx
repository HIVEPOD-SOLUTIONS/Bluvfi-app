import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';

/** A labelled checkbox: the whole row is the tap target. */
export function Check({ checked, onToggle, label, disabled }: { checked: boolean; onToggle: () => void; label: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      style={[styles.row, disabled && { opacity: 0.5 }]}
      hitSlop={6}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? (
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M5 12.5l4.5 4.5L19 7" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginTop: Spacing.md },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.tx2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: SharColors.deep, borderColor: SharColors.deep },
  text: { ...Type.body, color: Colors.tx0, flex: 1 },
});
