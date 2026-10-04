import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import type { VoiceState } from '@/hooks/use-voice-input';

const BARS = 36;

export function MicIcon({ color = Colors.tx1, size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={7} y={2} width={6} height={10} rx={3} stroke={color} strokeWidth={1.5} />
      <Path d="M4 9.5a6 6 0 0012 0M10 15.5V18" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

/** A mic button that starts voice input. */
export function MicButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={[styles.micButton, disabled && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Voice input">
      <MicIcon />
    </Pressable>
  );
}

/** Scrolling bars driven by the live input level while recording. */
function Waveform({ level }: { level: number }) {
  const [bars, setBars] = useState<number[]>(() => Array(BARS).fill(0));
  const latest = useRef(level);
  latest.current = level;

  useEffect(() => {
    const id = setInterval(() => setBars((prev) => [...prev.slice(1), latest.current]), 80);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.wave}>
      {bars.map((b, i) => (
        <View key={i} style={[styles.bar, { height: 3 + b * 22, opacity: 0.35 + b * 0.65 }]} />
      ))}
    </View>
  );
}

/**
 * The input row while voice is active: cancel, live waveform, and send (✓ arrow) while recording; a spinner while
 * the recording is being transcribed. Mirrors the web app's recording pill.
 */
export function VoiceBar({ state, level, onCancel, onSend }: { state: Exclude<VoiceState, 'idle'>; level: number; onCancel: () => void; onSend: () => void }) {
  if (state === 'transcribing') {
    return (
      <View style={[styles.row, { justifyContent: 'center', gap: Spacing.sm }]}>
        <ActivityIndicator color={Colors.sage} />
        <Text style={styles.text}>Transcribing…</Text>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Pressable onPress={onCancel} hitSlop={8} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Cancel recording">
        <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
          <Path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke={Colors.tx1} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Waveform level={level} />
      </View>
      <Pressable onPress={onSend} hitSlop={8} style={[styles.iconButton, { backgroundColor: Colors.blue }]} accessibilityRole="button" accessibilityLabel="Send voice message">
        <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
          <Path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  micButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 48,
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xxxl,
    paddingHorizontal: Spacing.md,
  },
  iconButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bg2, alignItems: 'center', justifyContent: 'center' },
  wave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 28 },
  bar: { width: 3, borderRadius: 2, backgroundColor: Colors.sage },
  text: { ...Type.body, color: Colors.tx1 },
});
