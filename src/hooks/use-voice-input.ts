import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import type * as ExpoAudio from 'expo-audio';
import { API_BASE_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { voiceFailureMessage, voiceNetworkMessage } from '@/lib/voice-errors';

export type VoiceState = 'idle' | 'recording' | 'transcribing';

/**
 * expo-audio is a native module, so a dev build made before it was added doesn't contain it, and importing it there
 * throws at startup. Load it defensively: without it voice is simply unavailable (the mic stays hidden) and the rest
 * of the app is unaffected. The answer never changes while the app runs, so the hooks below are called consistently.
 */
let audio: typeof ExpoAudio | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  audio = require('expo-audio') as typeof ExpoAudio;
} catch {
  audio = null;
}

/** Stand-ins used when the native module is missing, so the hook body can stay unconditional. */
const noRecorder = {
  getStatus: () => ({ durationMillis: 0 }),
  uri: null as string | null,
  prepareToRecordAsync: async () => {},
  record: () => {},
  stop: async () => {},
};
const idleRecorderState = { metering: undefined as number | undefined, durationMillis: 0 };

/** Recordings shorter than this are treated as an accidental tap and dropped. */
const MIN_RECORDING_MS = 600;
/** A voice message is a sentence or two; stop before the server's upload limit (and the user's patience). */
const MAX_RECORDING_MS = 2 * 60 * 1000;

/**
 * Voice input for the assistant, like the web app's mic: tap to record, tap the arrow to send. The recording is
 * transcribed by bluvfi's /api/voice/transcribe (per-user rate limited) and the text is handed to `onText` — the
 * caller sends it to the chat exactly as if it had been typed.
 */
export function useVoiceInput(onText: (text: string) => void) {
  const { getAccessToken } = useAuth();
  const realRecorder = audio ? audio.useAudioRecorder({ ...audio.RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }) : null;
  const realState = audio && realRecorder ? audio.useAudioRecorderState(realRecorder, 80) : null;
  const recorder = (realRecorder ?? noRecorder) as typeof noRecorder;
  const recState = (realState ?? idleRecorderState) as typeof idleRecorderState;
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const busy = useRef(false);

  // Metering is in dB (about -60 quiet … 0 loud); map it to 0–1 for the waveform.
  const level = state === 'recording' && typeof recState.metering === 'number' ? Math.max(0, Math.min(1, (recState.metering + 60) / 60)) : 0;

  const releaseMic = useCallback(async () => {
    try {
      await audio?.setAudioModeAsync({ allowsRecording: false });
    } catch {
      /* best effort */
    }
  }, []);

  const start = useCallback(async () => {
    if (!audio || busy.current || state !== 'idle') return;
    busy.current = true;
    setError(null);
    setPermissionDenied(false);
    try {
      const { granted } = await audio.AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        setPermissionDenied(true);
        setError('Microphone access is off. Turn it on in Settings to use voice.');
        return;
      }
      await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState('recording');
    } catch (err) {
      console.warn('[voice] could not start recording:', err);
      setError("Couldn't start the microphone. Please try again.");
      await releaseMic();
    } finally {
      busy.current = false;
    }
  }, [recorder, state, releaseMic]);

  const cancel = useCallback(async () => {
    try {
      await recorder.stop();
    } catch {
      /* wasn't recording */
    }
    await releaseMic();
    setState('idle');
  }, [recorder, releaseMic]);

  /** Stop, transcribe and hand the text to `onText`. */
  const finish = useCallback(async () => {
    if (busy.current || state !== 'recording') return;
    busy.current = true;
    setError(null);
    try {
      const durationMs = recorder.getStatus().durationMillis;
      await recorder.stop();
      await releaseMic();
      const uri = recorder.uri;
      if (!uri || durationMs < MIN_RECORDING_MS) {
        setState('idle');
        return;
      }

      setState('transcribing');
      const token = await getAccessToken();
      const form = new FormData();
      form.append('audio', { uri, name: 'voice.m4a', type: 'audio/mp4' } as unknown as Blob);
      const res = await fetch(`${API_BASE_URL}/api/voice/transcribe`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        // 429 carries the limit message ("daily voice limit… resets in about 5 hours"). Anything else shows what the server said and its status,
        // so a failure can be told apart (not signed in, voice not set up, the speech service down) instead of one generic line.
        console.warn('[voice] the server answered', res.status, data.error);
        setError(voiceFailureMessage(res.status, data.error));
        return;
      }
      const text = data.text?.trim();
      if (text) onText(text);
      else setError("Didn't catch that. Please try again.");
    } catch (err) {
      console.warn('[voice] transcription failed:', err);
      setError(voiceNetworkMessage(err));
    } finally {
      setState('idle');
      busy.current = false;
    }
  }, [recorder, state, releaseMic, getAccessToken, onText]);

  // Cap the length of one message: send what we have when the limit is reached.
  const overLimit = state === 'recording' && recState.durationMillis >= MAX_RECORDING_MS;
  useEffect(() => {
    if (overLimit) void finish();
  }, [overLimit, finish]);

  return {
    /** False on a build without the native audio module (rebuild the app to enable voice). */
    available: audio !== null,
    state,
    level,
    error,
    permissionDenied,
    start,
    cancel,
    finish,
    clearError: () => setError(null),
    openSettings: () => Linking.openSettings(),
  };
}
