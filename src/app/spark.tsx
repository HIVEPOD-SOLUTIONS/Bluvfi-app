import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { BadgeRow } from '@/components/shar/BadgeRow';
import { SharBurst } from '@/components/shar/SharBurst';
import { SharOrb } from '@/components/shar/SharOrb';
import { SquadCard } from '@/components/shar/SquadCard';
import { WeeklyBoard } from '@/components/shar/WeeklyBoard';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { useCollectSpark, useShar, type SparkState } from '@/hooks/use-shar';
import { playSharChime } from '@/hooks/use-shar-chime';
import { useReminders } from '@/hooks/use-spark-reminders';
import { timeLeft } from '@/lib/time-left';

const ORB = 220;

/** "2" / "2 × 1.5" style wording for the rule lines. */
const x = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Daily Spark: tap the Shar orb once a day to collect a few Shar. A streak builds with each day in a row, longer streaks pay more, every 7th
 * day pays a bonus, and verified Seeker Genesis Token holders get a multiplier on top. Open to everyone, not only creators. The server
 * decides the streak and the amount; this screen only shows them and plays the moment.
 */
export default function SparkScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const summary = useShar();
  const collect = useCollectSpark();
  const reminders = useReminders();
  const data = summary.data;
  const spark = data?.spark;
  const [shot, setShot] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Fresh numbers whenever the screen comes back into view (a new day, a collect elsewhere), and a clock for the countdown.
  const { refetch } = summary;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  // When midnight UTC passes with the screen open, the spark comes back: refetch once it has.
  useEffect(() => {
    if (spark?.collectedToday && new Date(spark.nextAt).getTime() <= now) refetch();
  }, [now, spark, refetch]);

  const dim = useSharedValue(1);
  useEffect(() => {
    dim.value = withTiming(spark?.collectedToday ? 0.55 : 1, { duration: 400 });
  }, [spark?.collectedToday, dim]);
  const orbStyle = useAnimatedStyle(() => ({ opacity: dim.value }));

  const canCollect = !!spark && spark.ready && !spark.collectedToday && !collect.isPending;

  const onCollect = async () => {
    if (!canCollect) return;
    try {
      const { spark: got } = await collect.mutateAsync();
      setShot((n) => n + 1);
      playSharChime(Date.now() + 5_000, got.seeker);
      toast({
        variant: 'success',
        title: `+${got.shar} Shar`,
        subtitle: got.bonus > 0 ? `Day ${got.streak} bonus included` : `Day ${got.streak} of your streak${got.seeker ? ' · Seeker boost' : ''}`,
      });
    } catch (e) {
      toast({ variant: 'error', title: 'Couldn’t collect it', subtitle: (e as Error)?.message });
      refetch();
    }
  };

  const onReminders = async (next: boolean) => {
    if (!next) {
      await reminders.turnOff();
      return;
    }
    const res = await reminders.turnOn();
    if (!res.reminders) toast({ variant: 'error', title: 'Reminders are off', subtitle: 'Allow notifications for Bluvfi in your phone’s settings to get them.' });
    else if (res.alerts) toast({ variant: 'success', title: 'Reminders and alerts are on', subtitle: 'Alerts show up when your phone next checks, which can take a little while.' });
    else toast({ variant: 'success', title: 'Reminders are on', subtitle: 'Alerts for claims and providers couldn’t be switched on right now. Try again later.' });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xxxl * 2, paddingHorizontal: Spacing.xl, gap: Spacing.lg }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M15 5l-7 7 7 7" stroke={Colors.tx0} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
          <Text style={styles.title}>Daily Spark</Text>
          <View style={{ width: 36 }} />
        </View>

        {summary.isLoading ? (
          <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.xxxl }} />
        ) : !data || !spark ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load your spark</Text>
            <Text style={styles.muted}>{(summary.error as Error | undefined)?.message ?? 'Check your connection and try again.'}</Text>
            <Button variant="outline" onPress={() => summary.refetch()}>
              Try again
            </Button>
          </View>
        ) : (
          <>
            <View style={[styles.card, styles.hero]}>
              <Pressable onPress={onCollect} disabled={!canCollect} accessibilityRole="button" accessibilityState={{ disabled: !canCollect }} accessibilityLabel={spark.collectedToday ? 'Today’s spark collected' : 'Collect today’s Daily Spark'}>
                <View style={{ width: ORB, height: ORB }}>
                  <Animated.View style={[StyleSheet.absoluteFill, orbStyle]}>
                    <SharOrb size={ORB} bright={spark.seeker || undefined} />
                  </Animated.View>
                  <SharBurst trigger={shot} size={ORB} />
                </View>
              </Pressable>
              <Text style={styles.streak}>{spark.streak}</Text>
              <Text style={styles.streakLabel}>DAY STREAK</Text>
              <Days days={spark.days} />
              {!spark.ready ? (
                <Text style={styles.note}>Daily Spark is being switched on. Try again soon.</Text>
              ) : spark.collectedToday ? (
                <Text style={styles.note}>
                  Collected. Tomorrow’s is worth +{spark.next.shar} Shar, back in {timeLeft(spark.nextAt, now)}.
                </Text>
              ) : (
                <>
                  <Text style={styles.note}>
                    {spark.streak > 0 ? `Keep your ${spark.streak}-day streak going: ` : 'Start a streak: '}tap the orb for +{spark.next.shar} Shar.
                  </Text>
                  <View style={{ alignSelf: 'stretch' }}>
                    <Button fullWidth onPress={onCollect} loading={collect.isPending}>
                      Collect +{spark.next.shar} Shar
                    </Button>
                  </View>
                  <Text style={styles.small}>Resets in {timeLeft(spark.nextAt, now)}</Text>
                </>
              )}
            </View>

            <Rules spark={spark} />

            {reminders.available ? (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Reminders and alerts</Text>
                    <Text style={styles.muted}>A nudge a few hours before your streak ends and before the weekly trial resets, and a note when a claim is paid or a provider you added is used. Notes arrive when your phone next checks, so they are not instant.</Text>
                  </View>
                  <Switch value={reminders.on} onValueChange={onReminders} trackColor={{ true: SharColors.body, false: Colors.bg3 }} thumbColor={Colors.tx0} accessibilityLabel="Remind me before my streak ends" />
                </View>
              </View>
            ) : null}

            <WeeklyBoard limit={5} />
            <SquadCard />
            <BadgeRow badges={data.badges} />

            <Pressable onPress={() => router.push('/invite' as never)} style={styles.card} accessibilityRole="button">
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Invite friends</Text>
                  <Text style={styles.muted}>Earn {data.rules.referralBonusPct}% of the Shar they earn from spending.</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** The last 7 days as dots: lit when collected, ringed for today. */
function Days({ days }: { days: SparkState['days'] }) {
  return (
    <View style={styles.days} accessibilityLabel={`${days.filter((d) => d.collected).length} of the last 7 days collected`}>
      {days.map((d) => (
        <View key={d.day} style={styles.dayWrap}>
          <View style={[styles.dot, d.collected && styles.dotOn, d.today && styles.dotToday]} />
          <Text style={styles.dayLabel}>{new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' })}</Text>
        </View>
      ))}
    </View>
  );
}

/** How the amounts work, from the server's own rules, so it can never say something different from what is paid. */
function Rules({ spark }: { spark: SparkState }) {
  const { baseShar, weekBonusShar, seekerMultiplier, streakTiers } = spark.rules;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>How it grows</Text>
      <Text style={styles.muted}>Collect once a day (it resets at midnight UTC). Miss a day and the streak starts over.</Text>
      <View style={{ gap: 6 }}>
        {streakTiers.map((t, i) => {
          const to = streakTiers[i + 1] ? streakTiers[i + 1].from - 1 : null;
          const label = to === null ? `Day ${t.from}+` : t.from === to ? `Day ${t.from}` : `Days ${t.from}–${to}`;
          return (
            <View key={t.from} style={styles.ruleRow}>
              <Text style={styles.ruleLabel}>{label}</Text>
              <Text style={styles.ruleValue}>
                {Math.floor(baseShar * t.multiplier)} Shar{t.multiplier > 1 ? `  ×${x(t.multiplier)}` : ''}
              </Text>
            </View>
          );
        })}
        <View style={styles.ruleRow}>
          <Text style={styles.ruleLabel}>Every 7th day</Text>
          <Text style={styles.ruleValue}>+{weekBonusShar} bonus</Text>
        </View>
      </View>
      <View style={[styles.seekerBox, spark.seeker && styles.seekerBoxOn]}>
        <Text style={[styles.seekerTitle, spark.seeker && { color: Colors.tx0 }]}>{spark.seeker ? 'Seeker Genesis boost on' : `Seeker Genesis holders get ×${x(seekerMultiplier)}`}</Text>
        <Text style={styles.small}>
          {spark.seeker
            ? `Your sparks and bonuses are ×${x(seekerMultiplier)}.`
            : 'Hold a Seeker Genesis Token in a Solana wallet linked to your account and your sparks and bonuses are boosted. It is checked on our server when you collect.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  title: { ...Type.h1, color: Colors.tx0 },
  card: { backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: Spacing.md },
  hero: { alignItems: 'center', borderColor: SharColors.tintBorder, gap: Spacing.xs },
  cardTitle: { ...Type.h2, color: Colors.tx0 },
  muted: { ...Type.body, color: Colors.tx1 },
  note: { ...Type.body, color: Colors.tx1, textAlign: 'center', marginVertical: Spacing.sm },
  small: { ...Type.small, color: Colors.tx2, textAlign: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  chevron: { ...Type.h1, color: Colors.tx1 },
  streak: { fontFamily: Fonts.monoBold, fontSize: 56, lineHeight: 64, color: Colors.tx0, marginTop: Spacing.sm },
  streakLabel: { ...Type.label, color: Colors.tx2, letterSpacing: 2, marginBottom: Spacing.sm },
  days: { flexDirection: 'row', gap: Spacing.md, marginVertical: Spacing.sm },
  dayWrap: { alignItems: 'center', gap: 4 },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.bg2, borderWidth: 1, borderColor: Colors.border },
  dotOn: { backgroundColor: SharColors.body, borderColor: SharColors.glow },
  dotToday: { borderColor: Colors.tx0, borderWidth: 2 },
  dayLabel: { ...Type.small, fontSize: 11, color: Colors.tx2 },
  ruleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  ruleLabel: { ...Type.body, color: Colors.tx1 },
  ruleValue: { fontFamily: Fonts.monoBold, fontSize: 14, color: Colors.tx0 },
  seekerBox: { backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: 4 },
  seekerBoxOn: { borderColor: SharColors.tintBorder, backgroundColor: SharColors.tint },
  seekerTitle: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.tx1 },
});
