import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { useSharLeaderboard } from '@/hooks/use-shar';
import { timeLeft } from '@/lib/time-left';

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * The weekly trial: this week's top earners (anonymous handles), where you stand, and when it resets. For everyone, not only creators, so
 * every person has something to chase. Sparks, purchases, companions and providers all count. `limit` shows fewer rows where space is tight.
 */
export function WeeklyBoard({ limit = 10, title = 'Weekly trial' }: { limit?: number; title?: string }) {
  const { data: board, isLoading } = useSharLeaderboard();
  const rows = board?.top.slice(0, limit) ?? [];
  const prizes = board?.prizes ?? [];
  const outside = board && (board.me.rank === null || board.me.rank > rows.length);

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.title}>{title}</Text>
        {board ? <Text style={styles.mono}>Resets in {timeLeft(board.weekEndsAt)}</Text> : null}
      </View>
      {prizes.length > 0 ? (
        <Text style={styles.prize}>
          Top {prizes.length} win Shar this week (claim it as SKR): {prizes.map((p) => `${p.place}. ${fmt(p.shar)}`).join(' · ')}. Earn at least {fmt(board?.prizeMinShar ?? 0)} to qualify.
        </Text>
      ) : null}
      {isLoading ? (
        <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.lg }} />
      ) : rows.length === 0 ? (
        <Text style={styles.muted}>No one has lit the way this week yet. Collect your Daily Spark and be first.</Text>
      ) : (
        <View style={{ marginTop: Spacing.xs }}>
          {rows.map((row) => (
            <View key={row.rank} style={[styles.row, row.you && styles.rowYou]}>
              <Text style={[styles.rank, row.rank <= 3 && { color: Colors.gold }]}>{row.rank}</Text>
              <View style={styles.nameWrap}>
                <Text style={[styles.name, row.you && { color: Colors.tx0 }]} numberOfLines={1}>
                  {row.you ? 'You' : row.handle}
                </Text>
                {row.seeker ? (
                  <View style={styles.seekerTag}>
                    <Text style={styles.seekerTagText}>SEEKER</Text>
                  </View>
                ) : null}
              </View>
              {row.prizeShar ? <Text style={styles.prizeAmount}>+{fmt(row.prizeShar)} prize</Text> : null}
              <Text style={styles.shar}>{fmt(row.shar)}</Text>
            </View>
          ))}
          {outside ? (
            <Text style={[styles.muted, { marginTop: Spacing.sm }]}>
              {board.me.shar > 0 ? `You’re ${board.me.rank ? `#${board.me.rank}` : 'on the board'} with ${fmt(board.me.shar)} Shar this week.` : 'You haven’t earned Shar this week yet.'}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: Spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  title: { ...Type.h2, color: Colors.tx0 },
  mono: { ...Type.label, color: Colors.tx2 },
  muted: { ...Type.body, color: Colors.tx1 },
  prize: { ...Type.small, color: Colors.gold },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 10, paddingHorizontal: Spacing.sm, borderRadius: Radii.md },
  rowYou: { backgroundColor: SharColors.tint, borderWidth: 1, borderColor: SharColors.tintBorder },
  rank: { width: 22, fontFamily: Fonts.monoBold, fontSize: 13, color: Colors.tx2, textAlign: 'center' },
  nameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { ...Type.body, color: Colors.tx1, flexShrink: 1 },
  seekerTag: { backgroundColor: SharColors.tint, borderRadius: 999, borderWidth: 1, borderColor: SharColors.tintBorder, paddingVertical: 1, paddingHorizontal: 7 },
  seekerTagText: { fontFamily: Fonts.monoBold, fontSize: 9, letterSpacing: 1, color: SharColors.glow },
  prizeAmount: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.gold },
  shar: { fontFamily: Fonts.monoBold, fontSize: 14, color: Colors.tx0 },
});
