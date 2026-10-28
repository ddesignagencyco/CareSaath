import { useSyncExternalStore } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import Sound, { AudioEncoderAndroidType, AudioSourceAndroidType, OutputFormatAndroidType } from 'react-native-nitro-sound';

/**
 * Voice notes: one recorder and one player for the whole app (starting a
 * second note stops the first, like WhatsApp). Recordings are AAC in .mp4 in
 * the app's files dir (a new file each time), which upload like any file.
 */

export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

/** Long enough for a care update; WhatsApp-style notes rarely run past this. */
export const MAX_VOICE_MS = 15 * 60_000;

export const recorder = {
  /** `onTick` gets the elapsed time in ms. */
  async start(onTick: (ms: number) => void): Promise<void> {
    await player.stop();
    Sound.setSubscriptionDuration(0.25);
    Sound.addRecordBackListener(e => onTick(e.currentPosition));
    await Sound.startRecorder(undefined, {
      AudioSourceAndroid: AudioSourceAndroidType.MIC,
      OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
      AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
      AudioSamplingRate: 44100,
      AudioEncodingBitRate: 64000,
      AudioChannels: 1,
    });
  },
  /** Resolves the recorded file's URI. */
  async stop(): Promise<string> {
    Sound.removeRecordBackListener();
    return Sound.stopRecorder();
  },
  async pause(): Promise<void> {
    await Sound.pauseRecorder();
  },
  async resume(): Promise<void> {
    await Sound.resumeRecorder();
  },
  async cancel(): Promise<void> {
    Sound.removeRecordBackListener();
    await Sound.stopRecorder().catch(() => '');
  },
};

/* ---- Playback ------------------------------------------------------------- */

interface PlayerState {
  /** Message id (or local upload id) that owns the player. */
  id: string | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
}

let state: PlayerState = { id: null, playing: false, positionMs: 0, durationMs: 0 };
const listeners = new Set<() => void>();
const set = (p: Partial<PlayerState>) => {
  state = { ...state, ...p };
  listeners.forEach(l => l());
};

export const player = {
  async toggle(id: string, uri: string) {
    if (state.id === id) {
      if (state.playing) {
        await Sound.pausePlayer().catch(() => '');
        set({ playing: false });
      } else {
        await Sound.resumePlayer().catch(() => '');
        set({ playing: true });
      }
      return;
    }
    await player.stop();
    Sound.setSubscriptionDuration(0.1);
    Sound.addPlayBackListener(e => {
      if (state.id === id) set({ positionMs: e.currentPosition, durationMs: e.duration || state.durationMs });
    });
    Sound.addPlaybackEndListener(() => {
      if (state.id === id) set({ playing: false, positionMs: 0 });
    });
    set({ id, playing: true, positionMs: 0, durationMs: 0 });
    try {
      await Sound.startPlayer(uri);
    } catch {
      set({ id: null, playing: false });
      throw new Error('playback');
    }
  },
  async seek(id: string, ms: number) {
    if (state.id !== id) return;
    await Sound.seekToPlayer(ms).catch(() => '');
    set({ positionMs: ms });
  },
  async stop() {
    if (!state.id) return;
    Sound.removePlayBackListener();
    Sound.removePlaybackEndListener();
    set({ id: null, playing: false, positionMs: 0 });
    await Sound.stopPlayer().catch(() => '');
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Player state as seen by one note: idle unless it owns the player. */
export function useVoicePlayback(id: string) {
  const s = useSyncExternalStore(subscribe, () => state);
  const mine = s.id === id;
  return { playing: mine && s.playing, positionMs: mine ? s.positionMs : 0, durationMs: mine ? s.durationMs : 0, active: mine };
}

/** "1:05" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
