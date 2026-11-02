import React, { useEffect, useState } from 'react';
import { Modal, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, MicOff, Phone, PhoneOff } from '../../../components/icons';
import { Text } from '../../../components/Text';
import { Avatar, Touchable } from '../../../components/ui';
import { useT } from '../../../i18n';
import { formatDuration } from '../../../lib/voice';
import { brandFixed, feedback, space } from '../../../theme';

type OverlayCall = { status: 'outgoing' | 'incoming' | 'connected'; peerName: string; muted: boolean };

/**
 * Real WebRTC **audio** call overlay (video is disabled product-wide). Driven by
 * the CallProvider: it shows the ringing/connected state and the live duration,
 * and exposes mute, accept/decline (incoming) and end.
 */
export function CallOverlay({
  call,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
}: {
  call: OverlayCall;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
}) {
  const t = useT('mobile.chat');
  const insets = useSafeAreaInsets();
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (call.status !== 'connected') return;
    const iv = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [call.status]);

  const name = call.peerName || t('caller');
  const status =
    call.status === 'outgoing' ? t('calling') : call.status === 'incoming' ? t('incomingCall') : formatDuration(secs * 1000);

  return (
    <Modal visible animationType="slide" onRequestClose={call.status === 'incoming' ? onReject : onEnd} statusBarTranslucent navigationBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={[styles.fill, { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xxl }]}>
        <View style={styles.who}>
          <View style={styles.avatarRing}>
            <Avatar name={name} size={112} />
          </View>
          <Text variant="h2" weight="extrabold" color="#fff" align="center" numberOfLines={2}>
            {name}
          </Text>
          <Text color={brandFixed[100]} align="center" numeric={call.status === 'connected'}>
            {`${t('voiceCall')} · ${status}`}
          </Text>
        </View>

        {call.status === 'incoming' ? (
          <View style={styles.answerRow}>
            <ActionButton color={feedback.danger600} icon={PhoneOff} label={t('decline')} onPress={onReject} />
            <ActionButton color={feedback.success600} icon={Phone} label={t('accept')} onPress={onAccept} />
          </View>
        ) : (
          <View style={styles.controls}>
            <Control icon={call.muted ? MicOff : Mic} label={call.muted ? t('unmute') : t('mute')} on={call.muted} onPress={onToggleMute} />
            <Touchable onPress={onEnd} accessibilityRole="button" accessibilityLabel={t('endCall')} rippleColor="rgba(255,255,255,0.25)" style={styles.end}>
              <PhoneOff size={30} color="#fff" />
            </Touchable>
          </View>
        )}
      </View>
    </Modal>
  );
}

function Control({ icon: Icon, label, on, onPress }: { icon: typeof Mic; label: string; on: boolean; onPress: () => void }) {
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

function ActionButton({ color, icon: Icon, label, onPress }: { color: string; icon: typeof Phone; label: string; onPress: () => void }) {
  return (
    <View style={styles.controlCol}>
      <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} rippleColor="rgba(255,255,255,0.25)" style={[styles.answer, { backgroundColor: color }]}>
        <Icon size={30} color="#fff" />
      </Touchable>
      <Text variant="caption" color="rgba(255,255,255,0.8)" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: brandFixed[900], justifyContent: 'space-between', paddingHorizontal: space.xl },
  who: { alignItems: 'center', gap: space.md, marginTop: space.xxl },
  avatarRing: { padding: 6, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: space.sm },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  answerRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  controlCol: { alignItems: 'center', gap: space.sm, width: 100 },
  control: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  controlOn: { backgroundColor: '#fff' },
  answer: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  end: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
});
