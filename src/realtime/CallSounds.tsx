import React, { useEffect } from 'react';
import { Platform, StyleSheet, Vibration } from 'react-native';
import Video, { type ReactVideoSource } from 'react-native-video';

export type CallSound = 'ringback' | 'ringtone';

// `{ uri: require(...) }` is react-native-video v6's typed form for a bundled asset.
const SOURCES: Record<CallSound, ReactVideoSource> = {
  ringback: { uri: require('../assets/sounds/ringback.wav') },
  ringtone: { uri: require('../assets/sounds/ringtone.wav') },
};

/** Ring-like buzz: wait 0, buzz 1 s, pause 1 s, repeated until cancelled. */
const VIBRATE_PATTERN = Platform.OS === 'android' ? [0, 1000, 1000] : [1000];

/**
 * Loops the caller's ringback tone or the callee's ringtone while a call rings.
 * Driven purely by `sound`: passing null unmounts the player, which releases
 * ExoPlayer and its audio focus, so every teardown path (answer, reject, end,
 * missed, error, provider unmount) silences it. The ringtone also vibrates.
 *
 * `audioOutput` is deliberately left unset: on Android setting it rewrites the
 * global AudioManager mode/speakerphone, which would fight WebRTC's own routing.
 */
export function CallSounds({ sound }: { sound: CallSound | null }) {
  useEffect(() => {
    if (sound !== 'ringtone') return;
    Vibration.vibrate(VIBRATE_PATTERN, true);
    return () => Vibration.cancel();
  }, [sound]);

  if (!sound) return null;
  return (
    <Video
      key={sound}
      source={SOURCES[sound]}
      repeat
      playInBackground
      ignoreSilentSwitch="ignore"
      volume={sound === 'ringback' ? 0.6 : 1}
      style={styles.hidden}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
