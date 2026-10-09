import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import type * as ExpoAudio from 'expo-audio';
import { useIsCreator, useShar } from './use-shar';

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

/**
 * Shar's voice: a few short phrases of bell notes, so it never wears thin (each visit plays a different one, never the same twice in a row).
 * Seekers (the top rank) have two richer phrases of their own. Made by scripts/make-shar-chime.cjs.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const EVERYONE: readonly number[] = [
  require('../../assets/sounds/shar-1.wav'),
  require('../../assets/sounds/shar-2.wav'),
  require('../../assets/sounds/shar-3.wav'),
  require('../../assets/sounds/shar-4.wav'),
];
const SEEKER: readonly number[] = [require('../../assets/sounds/shar-seeker-1.wav'), require('../../assets/sounds/shar-seeker-2.wav')];
/* eslint-enable @typescript-eslint/no-require-imports */

/** Soft, but clearly audible at a normal media volume. */
const VOLUME = 0.85;
/** Opening two Shar screens in a row (Home, then Shar) plays it once, not twice. */
export const CHIME_GAP_MS = 4_000;

const players = new Map<number, ExpoAudio.AudioPlayer>();
let lastPlayedAt = 0;
let lastSource: number | null = null;
let modeSet = false;

/** The phrase to play: from the Seeker set for a Seeker, else the everyone set; never the one that just played. */
export function pickSound(isSeeker: boolean, random: () => number = Math.random, previous: number | null = lastSource): number {
  const pool = isSeeker ? SEEKER : EVERYONE;
  const choices = pool.filter((s) => s !== previous);
  return choices[Math.floor(random() * choices.length)] ?? pool[0];
}

/** Plays one of Shar's phrases unless one just played. Never throws: a missing sound is not worth a crash. */
export function playSharChime(now = Date.now(), isSeeker = false, random: () => number = Math.random): boolean {
  if (!audio || now - lastPlayedAt < CHIME_GAP_MS) return false;
  try {
    if (!modeSet) {
      modeSet = true;
      // Plays over other audio and (on iPhones) with the silent switch on; a failure here must not stop the chime.
      audio.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
    }
    const source = pickSound(isSeeker, random);
    let player = players.get(source);
    if (!player) {
      player = audio.createAudioPlayer(source);
      players.set(source, player);
    }
    player.volume = VOLUME;
    player.seekTo(0);
    player.play();
    lastPlayedAt = now;
    lastSource = source;
    return true;
  } catch (err) {
    console.warn('[shar] the chime could not play:', err);
    return false;
  }
}

/**
 * Shar makes a sound when a provider creator opens a screen it lives on (Home, Shar, the open network). Call it from each such
 * screen; it plays every time the screen comes into focus, and never for anyone who isn't a creator. Seekers hear their own, richer phrases.
 */
export function useSharChime() {
  const isCreator = useIsCreator();
  const isSeeker = useShar().data?.tier.tier === 'seeker';
  useFocusEffect(
    useCallback(() => {
      if (isCreator) playSharChime(Date.now(), isSeeker);
    }, [isCreator, isSeeker]),
  );
}
