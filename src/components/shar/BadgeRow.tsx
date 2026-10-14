import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import type { SharBadge } from '@/hooks/use-shar';

/** A small medal: lit (a bright ring and a check) when earned, a dim outline when not. */
function Medal({ earned, seeker }: { earned: boolean; seeker: boolean }) {
  const ring = earned ? (seeker ? '#FFFFFF' : SharColors.glow) : Colors.tx2;
  return (
    <Svg width={34} height={34} viewBox="0 0 34 34" fill="none">
      <Circle cx={17} cy={17} r={14} fill={earned ? SharColors.tint : 'transparent'} stroke={ring} strokeWidth={earned ? 2 : 1.4} strokeDasharray={earned ? undefined : '3 3'} />
      {earned ? <Path d="M11 17.5l4 4 8-9" stroke={ring} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /> : null}
    </Svg>
  );
}

/**
 * Quests and badges: each one is something to do (the hint says what) and lights up when it is done. They are worked out from what the
 * person has already done, so nothing has to be claimed. Shown on the Spark screen, so there is always a next thing to chase.
 */
export function BadgeRow({ badges }: { badges: SharBadge[] | undefined }) {
  // An older server (before Daily Spark was deployed) sends no badges: show nothing rather than fail.
  if (!badges || badges.length === 0) return null;
  const done = badges.filter((b) => b.earned).length;
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.title}>Badges</Text>
        <Text style={styles.mono}>
          {done} of {badges.length}
        </Text>
      </View>
      <View style={styles.grid}>
        {badges.map((b) => (
          <View key={b.key} style={styles.item} accessible accessibilityLabel={`${b.label}. ${b.earned ? 'Earned.' : b.hint}`}>
            <Medal earned={b.earned} seeker={b.key === 'seeker_holder'} />
            <Text style={[styles.label, b.earned && styles.labelOn]} numberOfLines={2}>
              {b.label}
            </Text>
            {!b.earned ? (
              <Text style={styles.hint} numberOfLines={3}>
                {b.hint}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Just the earned badges as small chips, for tight spaces (under the orb). */
export function BadgeChips({ badges }: { badges: SharBadge[] | undefined }) {
  const earned = (badges ?? []).filter((b) => b.earned);
  if (earned.length === 0) return null;
  return (
    <View style={styles.chips}>
      {earned.map((b) => (
        <View key={b.key} style={styles.chip}>
          <Text style={styles.chipText}>{b.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: Spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...Type.h2, color: Colors.tx0 },
  mono: { ...Type.label, color: Colors.tx2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  item: { width: '30%', flexGrow: 1, alignItems: 'center', gap: 4, paddingVertical: Spacing.sm },
  label: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx2, textAlign: 'center' },
  labelOn: { color: Colors.tx0 },
  hint: { ...Type.small, fontSize: 11, color: Colors.tx2, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: { backgroundColor: SharColors.tint, borderRadius: 999, borderWidth: 1, borderColor: SharColors.tintBorder, paddingVertical: 3, paddingHorizontal: 10 },
  chipText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: SharColors.glow },
});
