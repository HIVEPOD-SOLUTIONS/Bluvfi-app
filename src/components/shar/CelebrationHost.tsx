import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { useShar } from '@/hooks/use-shar';
import { useReminderSync } from '@/hooks/use-spark-reminders';
import { CHIME_GAP_MS, playSharChime } from '@/hooks/use-shar-chime';
import { useAuth } from '@/lib/auth-context';
import { celebrate, celebrationFor, consumeIgnoredGain, onCelebrate, snapshotOf, type Celebration, type SharSeen } from '@/lib/shar-celebrate';
import { SharBurst } from './SharBurst';
import { SharOrb } from './SharOrb';

/** How long the celebration stays up if nobody taps it away. */
const SHOW_MS = 2800;

/** SecureStore keys may only hold letters, digits and . - _ ; a Privy id has colons. */
const keyFor = (userId: string) => `bluvfi.shar-seen.${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

/**
 * Watches the signed-in person's Shar and celebrates when it grows (a purchase, a companion, a provider) or they rank up. What was last
 * seen is remembered between launches, so Shar that landed while the app was closed still gets its moment the next time it opens. The
 * first ever look at an account celebrates nothing. Never throws: a celebration is not worth a crash.
 */
function useSharCelebrations() {
  const { userId } = useAuth();
  const { data } = useShar();
  const seen = useRef<SharSeen | null | undefined>(undefined); // undefined: not read from storage yet
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    seen.current = undefined;
    setLoaded(false);
    SecureStore.getItemAsync(keyFor(userId))
      .then((raw) => {
        if (!alive) return;
        try {
          const parsed = raw ? (JSON.parse(raw) as SharSeen) : null;
          seen.current = parsed && Number.isFinite(parsed.lifetime) ? parsed : null;
        } catch {
          seen.current = null;
        }
      })
      .catch(() => {
        if (alive) seen.current = null;
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !loaded || !data || seen.current === undefined) return;
    const next = snapshotOf(data);
    const prev = seen.current;
    const ignore = prev ? consumeIgnoredGain(next.lifetime - prev.lifetime) : 0;
    const c = celebrationFor(prev, next, ignore);
    seen.current = { lifetime: next.lifetime, tier: next.tier, referralBonus: next.referralBonus, providerEarned: next.providerEarned };
    SecureStore.setItemAsync(keyFor(userId), JSON.stringify(seen.current)).catch(() => {});
    if (c) celebrate(c);
  }, [userId, loaded, data]);
}

/** Mounted once, over everything, while someone is signed in. Shows the orb bursting with a sound and a few words. */
export function CelebrationHost() {
  useSharCelebrations();
  useReminderSync();
  const [current, setCurrent] = useState<Celebration | null>(null);
  const [shot, setShot] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const off = onCelebrate((c) => {
      setCurrent(c);
      setShot((n) => n + 1);
      playSharChime(Date.now() + CHIME_GAP_MS, c.kind === 'rank' && c.tier === 'seeker'); // a celebration always sounds, even right after the screen's own chime
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCurrent(null), SHOW_MS);
    });
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!current) return null;
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(260)} style={styles.backdrop} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setCurrent(null)} accessibilityRole="button" accessibilityLabel="Dismiss" />
      <View style={styles.card} pointerEvents="none" accessibilityLiveRegion="polite">
        <View style={styles.orb}>
          <SharBurst trigger={shot} size={220} />
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={styles.orbInner}>
              <SharOrb size={150} bright={current.kind === 'rank' && current.tier === 'seeker' ? true : undefined} />
            </View>
          </View>
        </View>
        {current.kind === 'rank' ? <Text style={styles.eyebrow}>RANK UP</Text> : null}
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.subtitle}>{current.subtitle}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,20,0.72)', alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
  card: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl },
  orb: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  orbInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { ...Type.label, color: SharColors.glow, letterSpacing: 2 },
  title: { fontFamily: Fonts.monoBold, fontSize: 30, color: Colors.tx0, textAlign: 'center' },
  subtitle: { ...Type.body, color: Colors.tx1, textAlign: 'center', borderRadius: Radii.lg },
});
