import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, MicOff, Phone, PhoneOff, ShieldCheck, Volume2 } from '../../../components/icons';
import { Text } from '../../../components/Text';
import { Avatar, Touchable } from '../../../components/ui';
import { useT } from '../../../i18n';
import { formatDuration } from '../../../lib/voice';
import { space } from '../../../theme';

type OverlayCall = { status: 'outgoing' | 'incoming' | 'connected'; peerName: string; muted: boolean; ringing?: boolean; calleeOnline?: boolean };

/**
 * Animated sound wave bars for active audio calls, mirroring the web equalizer.
 */
function SoundWave({ active }: { active: boolean }) {
  const bar1 = useRef(new Animated.Value(0.35)).current;
  const bar2 = useRef(new Animated.Value(0.65)).current;
  const bar3 = useRef(new Animated.Value(0.4)).current;
  const bar4 = useRef(new Animated.Value(0.85)).current;
  const bar5 = useRef(new Animated.Value(0.5)).current;
  const bar6 = useRef(new Animated.Value(0.75)).current;
  const bar7 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!active) return;
    const bars = [bar1, bar2, bar3, bar4, bar5, bar6, bar7];
    const anims = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: 0.2 + ((i * 13) % 7) / 10,
            duration: 320 + (i % 3) * 120,
            useNativeDriver: false,
          }),
          Animated.timing(bar, {
            toValue: 0.95 - ((i * 7) % 4) / 10,
            duration: 380 + (i % 2) * 160,
            useNativeDriver: false,
          }),
        ]),
      ),
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [active, bar1, bar2, bar3, bar4, bar5, bar6, bar7]);

  if (!active) return null;

  const barValues = [bar1, bar2, bar3, bar4, bar5, bar6, bar7];

  return (
    <View style={styles.waveRow}>
      {barValues.map((val, idx) => (
        <Animated.View
          key={idx}
          style={[
            styles.waveBar,
            {
              height: val.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 26],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * Concentric pulsing ring behind avatar while ringing / connected.
 */
function PulsingAvatar({ children, ringing }: { children: React.ReactNode; ringing: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!ringing) return;
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.22, duration: 1300, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 1300, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.1, duration: 1300, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 1300, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [ringing, scale, opacity]);

  return (
    <View style={styles.avatarWrap}>
      {ringing && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              transform: [{ scale }],
              opacity,
            },
          ]}
        />
      )}
      <View style={styles.avatarInner}>{children}</View>
    </View>
  );
}

/**
 * Real WebRTC **audio** call overlay (video disabled product-wide).
 * Styled with dark backdrop, sound wave visualizer, and sleek glass dock.
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
  const [speakerOn, setSpeakerOn] = useState(false);

  useEffect(() => {
    if (call.status !== 'connected') return;
    const iv = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [call.status]);

  const name = call.peerName || t('caller');
  const isConnected = call.status === 'connected';
  const isIncoming = call.status === 'incoming';

  return (
    <Modal visible animationType="fade" onRequestClose={isIncoming ? onReject : onEnd} statusBarTranslucent navigationBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={[styles.canvas, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
        {/* Top security badge */}
        <View style={styles.topBar}>
          <View style={styles.encryptedPill}>
            <ShieldCheck size={13} color="#10b981" />
            <Text variant="caption" weight="semibold" color="#a7f3d0">
              End-to-end encrypted
            </Text>
          </View>
        </View>

        {/* Center peer info + avatar + visualizer */}
        <View style={styles.centerSection}>
          <PulsingAvatar ringing={!isConnected}>
            <Avatar name={name} size={118} />
          </PulsingAvatar>

          <Text variant="h2" weight="extrabold" color="#ffffff" align="center" numberOfLines={2} style={styles.nameText}>
            {name}
          </Text>

          {/* Status pill */}
          <View style={[styles.statusPill, isConnected && styles.statusPillConnected]}>
            {isConnected && <View style={styles.liveDot} />}
            <Text variant="caption" weight="bold" color={isConnected ? '#34d399' : 'rgba(255,255,255,0.75)'} numeric={isConnected}>
              {isConnected
                ? formatDuration(secs * 1000)
                : isIncoming
                ? t('incomingCall')
                : call.ringing && call.calleeOnline
                ? t('ringing')
                : t('calling')}
            </Text>
          </View>

          {/* Animated sound wave bars when call is active */}
          <View style={styles.waveContainer}>
            <SoundWave active={isConnected || call.status === 'outgoing'} />
          </View>
        </View>

        {/* Bottom controls dock */}
        <View style={styles.dockContainer}>
          {isIncoming ? (
            <View style={styles.dockRow}>
              <DockButton
                icon={PhoneOff}
                label={t('decline')}
                bgColor="#dc2626"
                iconColor="#ffffff"
                onPress={onReject}
                size={66}
              />
              <DockButton
                icon={Phone}
                label={t('accept')}
                bgColor="#059669"
                iconColor="#ffffff"
                onPress={onAccept}
                size={66}
              />
            </View>
          ) : (
            <View style={styles.dockRow}>
              {/* Mute */}
              <DockButton
                icon={call.muted ? MicOff : Mic}
                label={call.muted ? t('unmute') : t('mute')}
                bgColor={call.muted ? '#ffffff' : 'rgba(255,255,255,0.14)'}
                iconColor={call.muted ? '#111827' : '#ffffff'}
                onPress={onToggleMute}
                active={call.muted}
                size={58}
              />

              {/* End Call */}
              <DockButton
                icon={PhoneOff}
                label={t('endCall')}
                bgColor="#dc2626"
                iconColor="#ffffff"
                onPress={onEnd}
                size={68}
                isEnd
              />

              {/* Speaker */}
              <DockButton
                icon={Volume2}
                label={t('speaker')}
                bgColor={speakerOn ? '#ffffff' : 'rgba(255,255,255,0.14)'}
                iconColor={speakerOn ? '#111827' : '#ffffff'}
                onPress={() => setSpeakerOn(s => !s)}
                active={speakerOn}
                size={58}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function DockButton({
  icon: Icon,
  label,
  bgColor,
  iconColor,
  onPress,
  size = 58,
  active,
  isEnd,
}: {
  icon: typeof Mic;
  label: string;
  bgColor: string;
  iconColor: string;
  onPress: () => void;
  size?: number;
  active?: boolean;
  isEnd?: boolean;
}) {
  return (
    <View style={styles.buttonCol}>
      <Touchable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        rippleColor="rgba(255,255,255,0.3)"
        style={[
          styles.roundBtn,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
          isEnd && styles.endGlow,
          active && styles.activeBtn,
        ]}>
        <Icon size={isEnd ? 30 : 25} color={iconColor} />
      </Touchable>
      <Text variant="caption" weight="medium" color="rgba(255,255,255,0.78)" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: '#091312',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  topBar: {
    alignItems: 'center',
    marginTop: space.sm,
  },
  encryptedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.28)',
  },
  centerSection: {
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  avatarWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
  },
  avatarInner: {
    padding: 4,
    borderRadius: 64,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(16, 185, 129, 0.45)',
  },
  nameText: {
    letterSpacing: -0.3,
    marginBottom: space.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  statusPillConnected: {
    backgroundColor: 'rgba(5, 150, 105, 0.16)',
    borderColor: 'rgba(5, 150, 105, 0.35)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  waveContainer: {
    height: 34,
    marginTop: space.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  waveBar: {
    width: 4,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  dockContainer: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginHorizontal: space.xs,
  },
  dockRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  buttonCol: {
    alignItems: 'center',
    gap: 8,
    width: 76,
  },
  roundBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBtn: {
    shadowColor: '#ffffff',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  endGlow: {
    shadowColor: '#ef4444',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
});
