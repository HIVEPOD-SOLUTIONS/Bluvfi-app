import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { useShar, useSharLeaderboard } from '@/hooks/use-shar';
import { timeLeft } from '@/lib/time-left';
import { SharOrb } from './SharOrb';

/**
 * Home's Daily Spark card, for everyone: the streak, whether today's spark is waiting, and where you stand in the weekly trial with the
 * time left. Tapping opens the Spark screen. Hidden until the first load succeeds.
 */
export function SparkCard() {
  const spark = useShar().data?.spark;
  const board = useSharLeaderboard().data;
  if (!spark) return null;

  const status = !spark.ready
    ? 'Switching on soon'
    : spark.collectedToday
      ? `Collected · back in ${timeLeft(spark.nextAt)}`
      : `Tap to collect +${spark.next.shar} Shar`;
  const week = board ? (board.me.rank ? `Weekly trial #${board.me.rank}` : 'Weekly trial') : null;

  return (
    <Pressable onPress={() => router.push('/spark' as never)} style={[styles.card, !spark.collectedToday && spark.ready && styles.cardLive]} accessibilityRole="button" accessibilityLabel={`Daily Spark. ${spark.streak} day streak. ${status}`}>
      <SharOrb size={52} animated={!spark.collectedToday} />
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>DAILY SPARK · {spark.streak} DAY STREAK</Text>
        <Text style={styles.status}>{status}</Text>
        {week && board ? (
          <Text style={styles.week}>
            {week} · resets in {timeLeft(board.weekEndsAt)}
          </Text>
        ) : null}
      </View>
      <Text style={styles.go}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bg1, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg },
  cardLive: { borderColor: SharColors.tintBorder, backgroundColor: SharColors.tint },
  label: { ...Type.label, color: Colors.tx2 },
  status: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.tx0, marginTop: 2 },
  week: { ...Type.small, color: Colors.tx1, marginTop: 2 },
  go: { fontSize: 24, color: Colors.tx1, paddingRight: 2 },
});
