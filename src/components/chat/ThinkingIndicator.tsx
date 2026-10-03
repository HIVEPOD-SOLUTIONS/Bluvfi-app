import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Type } from '@/constants/theme';

const SPINNER_FRAMES = ['✦', '✧', '✶', '✷', '✸', '✹', '✺', '✻'];

const PHRASES = [
  'Checking bills',
  'Crunching numbers',
  'Looking up prices',
  'Reviewing portfolio',
  'Fetching market data',
  'Analyzing options',
  'Looking things up',
  'Working on it',
];

/** The assistant's "working on it" line: a cycling sparkle and a rotating phrase (same as the web chat). */
export function ThinkingIndicator() {
  const [frame, setFrame] = useState(0);
  const [phrase, setPhrase] = useState(() => Math.floor(Math.random() * PHRASES.length));
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setPhrase((p) => (p + 1) % PHRASES.length);
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    }, 1500);
    return () => clearInterval(id);
  }, [fade]);

  return (
    <View style={styles.row}>
      <Text style={styles.spinner}>{SPINNER_FRAMES[frame]}</Text>
      <Animated.Text style={[styles.phrase, { opacity: fade }]}>{PHRASES[phrase]}...</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: 6,
  },
  spinner: {
    ...Type.h2,
    fontFamily: Type.label.fontFamily,
    color: Colors.sage,
  },
  phrase: {
    ...Type.small,
    color: Colors.sage,
  },
});
