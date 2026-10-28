import React, { useEffect, useState } from 'react';
import { Modal, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, MicOff, PhoneOff, Video, VideoOff, Volume2, type IconType } from '../../../components/icons';
import { Text } from '../../../components/Text';
import { Avatar, Touchable } from '../../../components/ui';
import { useT } from '../../../i18n';
import { formatDuration } from '../../../lib/voice';
import { brandFixed, space } from '../../../theme';

/**
 * Voice / video call screen. Simulated like the web's CallOverlay: it rings,
 * "connects" and counts the call time. Real calling needs a WebRTC service on
 * the backend (TODO(backend)); the controls are the ones that will drive it.
 */
export function CallScreen({ call, name, photoUrl, onEnd }: { call: { video: boolean } | null; name: string; photoUrl?: string | null; onEnd: (seconds: number) => void }) {
  if (!call) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={() => onEnd(0)} statusBarTranslucent navigationBarTranslucent>
      <StatusBar barStyle="light-content" />
      <Call video={call.video} name={name} photoUrl={photoUrl} onEnd={onEnd} />
    </Modal>
  );
}

function Call({ video, name, photoUrl, onEnd }: { video: boolean; name: string; photoUrl?: string | null; onEnd: (seconds: number) => void }) {
  const t = useT('mobile.chat');
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'calling' | 'ringing' | 'live'>('calling');
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(video);
  const [camera, setCamera] = useState(true);

  useEffect(() => {
    const a = setTimeout(() => setPhase('ringing'), 1200);
    const b = setTimeout(() => setPhase('live'), 3600);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  useEffect(() => {
    if (phase !== 'live') return;
    const iv = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  const status = phase === 'calling' ? t('calling') : phase === 'ringing' ? t('ringing') : formatDuration(secs * 1000);

  return (
    <View style={[styles.fill, { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xxl }]}>
      <View style={styles.who}>
        <View style={styles.avatarRing}>
          <Avatar name={name} uri={photoUrl} size={112} />
        </View>
        <Text variant="h2" weight="extrabold" color="#fff" align="center" numberOfLines={2}>
          {name}
        </Text>
        <Text color={brandFixed[100]} align="center" numeric={phase === 'live'}>
          {`${video ? t('videoCall') : t('voiceCall')} · ${status}`}
        </Text>
      </View>

      <Text variant="small" color="rgba(255,255,255,0.65)" align="center" style={styles.note}>
        {t('callSimNote')}
      </Text>

      <View style={styles.controls}>
        <Control icon={muted ? MicOff : Mic} label={muted ? t('unmute') : t('mute')} on={muted} onPress={() => setMuted(v => !v)} />
        {video ? (
          <Control icon={camera ? Video : VideoOff} label={t('camera')} on={!camera} onPress={() => setCamera(v => !v)} />
        ) : (
          <Control icon={Volume2} label={t('speaker')} on={speaker} onPress={() => setSpeaker(v => !v)} />
        )}
        <Touchable onPress={() => onEnd(phase === 'live' ? secs : 0)} accessibilityRole="button" accessibilityLabel={t('endCall')} rippleColor="rgba(255,255,255,0.25)" style={styles.end}>
          <PhoneOff size={30} color="#fff" />
        </Touchable>
      </View>
    </View>
  );
}

function Control({ icon: Icon, label, on, onPress }: { icon: IconType; label: string; on: boolean; onPress: () => void }) {
  return (
    <View style={styles.controlCol}>
      <Touchable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} rippleColor="rgba(255,255,255,0.25)" style={[styles.control, on && styles.controlOn]}>
        <Icon size={26} color={on ? brandFixed[900] : '#fff'} />
      </Touchable>
      <Text variant="caption" color="rgba(255,255,255,0.8)" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: brandFixed[900], justifyContent: 'space-between', paddingHorizontal: space.xl },
  who: { alignItems: 'center', gap: space.md },
  avatarRing: { padding: 6, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: space.sm },
  note: { paddingHorizontal: space.lg },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  controlCol: { alignItems: 'center', gap: space.sm, width: 84 },
  control: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  controlOn: { backgroundColor: '#fff' },
  end: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center', marginTop: -4 },
});
