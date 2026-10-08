import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import type * as ExpoAudio from 'expo-audio';
import { useIsCreator } from './use-shar';

/**
 * expo-audio is a native module: a dev build made before it was added doesn't contain it, and importing it there throws at startup.
 * Load it defensively; without it Shar is simply silent and nothing else changes (same approach as the voice input).
 */
let audio: typeof ExpoAudio | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  audio = require('expo-audio') as typeof ExpoAudio;
} catch {
  audio = null;
}

/** The chime is quiet on purpose: a soft shimmer, not an alert. */
const VOLUME = 0.5;
/** Opening two Shar screens in a row (Home, then Shar) plays it once, not twice. */
export const CHIME_GAP_MS = 4_000;

let player: ExpoAudio.AudioPlayer | null = null;
let lastPlayedAt = 0;

/** Plays Shar's chime unless it just played. Never throws: a missing sound is not worth a crash. */
export function playSharChime(now = Date.now()): boolean {
  if (!audio || now - lastPlayedAt < CHIME_GAP_MS) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    player ??= audio.createAudioPlayer(require('../../assets/sounds/shar-chime.wav'));
    player.volume = VOLUME;
    player.seekTo(0);
    player.play();
    lastPlayedAt = now;
    return true;
  } catch {
    return false;
  }
}

/**
 * Shar makes a soft sound when a provider creator opens a screen it lives on (Home, Shar, the open network). Call it from each such
 * screen; it plays every time the screen comes into focus, and never for anyone who isn't a creator.
 */
export function useSharChime() {
  const isCreator = useIsCreator();
  useFocusEffect(
    useCallback(() => {
      if (isCreator) playSharChime();
    }, [isCreator]),
  );
}
