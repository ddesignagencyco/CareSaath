import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Image, PanResponder, Pressable, StyleSheet, Vibration, View, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { ChatMessage } from '../../../api/chat/types';
import { ArrowUp, Ban, Check, CheckCheck, CornerUpLeft, FileText, Mic, Pause, Play, RotateCw, Video as VideoIcon, type IconType } from '../../../components/icons';
import { Text } from '../../../components/Text';
import { Touchable } from '../../../components/ui';
import { formatBytes } from '../../../i18n/format';
import { useSettings, useT } from '../../../i18n';
import type { ChatUpload } from '../../../lib/uploads';
import { formatDuration, player, useVoicePlayback } from '../../../lib/voice';
import { colors, inkFixed, radius, space, themed } from '../../../theme';
import { clock, isRtlText, usePreview } from './common';
import type { ViewerMedia } from './MediaViewer';

/* ---- Progress ring ---------------------------------------------------------- */

/** Circular upload progress with the pause / resume control in the middle. */
export function ProgressRing({ progress, size = 48, color, track, icon: Icon, label, onPress, spinning }: {
  progress: number;
  size?: number;
  color: string;
  track: string;
  icon: IconType;
  label: string;
  onPress: () => void;
  /** No known progress yet (creating the session, retry pending): a short arc. */
  spinning?: boolean;
}) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = spinning ? 0.12 : Math.max(0.02, Math.min(1, progress));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={{ width: size, height: size }}>
      <View style={[styles.ringFill, { width: size, height: size, borderRadius: size / 2, backgroundColor: track }]} />
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * p} ${c}`}
          strokeLinecap="round"
          // Start at 12 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Icon size={size * 0.42} color={color} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

/* ---- Swipe to reply --------------------------------------------------------- */

const SWIPE_MAX = 84;
const SWIPE_REPLY = 56;

/**
 * Drag a message towards the reading end (right in English, left in Urdu)
 * to reply, as in WhatsApp: the reply arrow fades in, the phone ticks once
 * at the threshold, and letting go there opens the reply bar. Vertical
 * drags still scroll the list.
 */
function SwipeReply({ onReply, children }: { onReply: () => void; children: React.ReactNode }) {
  const { isRTL } = useSettings();
  const dir = isRTL ? -1 : 1;
  const x = useRef(new Animated.Value(0)).current;
  const armed = useRef(false);
  const latest = useRef(onReply);
  latest.current = onReply;

  const pan = useMemo(() => {
    const reset = () => {
      armed.current = false;
      Animated.spring(x, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    };
    return PanResponder.create({
      // Capture phase: the bubble's own press handler is the responder by
      // then, so a plain (bubble-phase) handler would never get the swipe.
      onMoveShouldSetPanResponderCapture: (_, g) => g.dx * dir > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        const d = Math.max(0, Math.min(SWIPE_MAX, g.dx * dir));
        x.setValue(d * dir);
        if (d >= SWIPE_REPLY && !armed.current) {
          armed.current = true;
          Vibration.vibrate(12);
        } else if (d < SWIPE_REPLY) {
          armed.current = false;
        }
      },
      onPanResponderRelease: () => {
        if (armed.current) latest.current();
        reset();
      },
      onPanResponderTerminate: reset,
    });
  }, [dir, x]);

  const opacity = x.interpolate({ inputRange: dir > 0 ? [0, SWIPE_REPLY] : [-SWIPE_REPLY, 0], outputRange: dir > 0 ? [0, 1] : [1, 0], extrapolate: 'clamp' });
  return (
    <View {...pan.panHandlers}>
      <Animated.View style={[styles.swipeIcon, { opacity }]} pointerEvents="none">
        <CornerUpLeft size={18} color={colors.primaryText} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: x }] }}>{children}</Animated.View>
    </View>
  );
}

/** Brief tint behind a message the user jumped to from a reply quote. */
function useFlash(on: boolean) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) return;
    a.setValue(1);
    Animated.timing(a, { toValue: 0, duration: 1400, delay: 300, useNativeDriver: true }).start();
  }, [on, a]);
  return a;
}

/* ---- Voice note ------------------------------------------------------------- */

function VoiceNote({ id, uri, durationMs, mine, onError }: { id: string; uri: string; durationMs?: number; mine: boolean; onError: () => void }) {
  const t = useT('mobile.chat');
  const pb = useVoicePlayback(id);
  const total = pb.durationMs || durationMs || 0;
  const pct = total ? Math.min(1, pb.positionMs / total) : 0;
  const fg = mine ? colors.onPrimary : colors.primaryText;
  return (
    <View style={styles.voice}>
      <Pressable
        onPress={() => player.toggle(id, uri).catch(onError)}
        accessibilityRole="button"
        accessibilityLabel={pb.playing ? t('pausePlayback') : t('play')}
        hitSlop={6}
        style={[styles.voiceBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.18)' : colors.primarySoft }]}>
        {pb.playing ? <Pause size={20} color={fg} fill={fg} /> : <Play size={20} color={fg} fill={fg} style={styles.playNudge} />}
      </Pressable>
      <View style={styles.flex}>
        <Pressable
          // Tap along the bar to jump there.
          onPress={e => total && pb.active && player.seek(id, (e.nativeEvent.locationX / VOICE_BAR) * total)}
          style={styles.voiceTrackHit}>
          <View style={[styles.voiceTrack, { backgroundColor: mine ? 'rgba(255,255,255,0.3)' : colors.borderStrong }]}>
            <View style={[styles.voiceProgress, { width: `${pct * 100}%`, backgroundColor: fg }]} />
          </View>
        </Pressable>
        <Text variant="caption" numeric color={mine ? 'rgba(255,255,255,0.85)' : colors.textMuted}>
          {formatDuration(pb.active && pb.positionMs ? pb.positionMs : total)}
        </Text>
      </View>
      <Mic size={18} color={mine ? 'rgba(255,255,255,0.7)' : colors.textSubtle} />
    </View>
  );
}

const VOICE_BAR = 150;

/* ---- Media blocks ----------------------------------------------------------- */

function useMediaWidth() {
  const { width } = useWindowDimensions();
  return Math.min(260, Math.round(width * 0.66));
}

/** Photo sized from its own aspect ratio, within sensible bounds. */
function mediaHeight(w: number, width?: number, height?: number) {
  const ratio = width && height ? height / width : 0.75;
  return Math.round(w * Math.min(1.3, Math.max(0.56, ratio)));
}

function VideoTile({ w, h, durationMs, children }: { w: number; h: number; durationMs?: number; children?: React.ReactNode }) {
  return (
    <View style={[styles.video, { width: w, height: h }]}>
      <VideoIcon size={28} color="rgba(255,255,255,0.35)" style={styles.videoGlyph} />
      {children}
      {!!durationMs && (
        <View style={styles.videoMeta}>
          <VideoIcon size={14} color="#fff" />
          <Text variant="caption" weight="semibold" numeric color="#fff">
            {formatDuration(durationMs)}
          </Text>
        </View>
      )}
    </View>
  );
}

function FileRow({ name, size, mine, lead }: { name: string; size: number; mine: boolean; lead?: React.ReactNode }) {
  return (
    <View style={[styles.file, { backgroundColor: mine ? 'rgba(255,255,255,0.14)' : colors.surfaceMuted }]}>
      {lead ?? (
        <View style={[styles.fileIcon, { backgroundColor: mine ? 'rgba(255,255,255,0.18)' : colors.primarySoft }]}>
          <FileText size={22} color={mine ? colors.onPrimary : colors.primaryText} />
        </View>
      )}
      <View style={styles.flex}>
        <Text weight="semibold" numberOfLines={2} color={mine ? colors.onPrimary : colors.text}>
          {name}
        </Text>
        <Text variant="caption" numeric color={mine ? 'rgba(255,255,255,0.8)' : colors.textMuted}>
          {formatBytes(size)}
        </Text>
      </View>
    </View>
  );
}

/* ---- Message bubble --------------------------------------------------------- */

/** Read ticks: the web's light blue, readable on the teal bubble and in dark mode. */
const READ_TICK = '#7dd3fc';

function Meta({ message, mine, overlay }: { message: Pick<ChatMessage, 'createdAt' | 'readByThem'>; mine: boolean; overlay?: boolean }) {
  const color = overlay ? '#fff' : mine ? 'rgba(255,255,255,0.8)' : colors.textSubtle;
  return (
    <View style={[styles.meta, overlay && styles.metaOverlay]}>
      <Text variant="caption" numeric color={color}>
        {clock(message.createdAt)}
      </Text>
      {mine && (message.readByThem ? <CheckCheck size={15} color={READ_TICK} strokeWidth={2.4} /> : <Check size={15} color={color} strokeWidth={2.4} />)}
    </View>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  replyTo,
  replyName,
  onLongPress,
  onOpenMedia,
  onOpenFile,
  onPlayError,
  onReply,
  onJump,
  highlighted,
}: {
  message: ChatMessage;
  replyTo?: ChatMessage;
  replyName?: string;
  onLongPress: (m: ChatMessage) => void;
  onOpenMedia: (m: ChatMessage) => void;
  onOpenFile: (m: ChatMessage) => void;
  onPlayError: () => void;
  onReply: (m: ChatMessage) => void;
  /** Scroll to the quoted message. */
  onJump: (id: string) => void;
  highlighted?: boolean;
}) {
  const t = useT('mobile.chat');
  const preview = usePreview();
  const w = useMediaWidth();
  const mine = message.sender === 'me';
  const media = message.media;
  const fg = mine ? colors.onPrimary : colors.text;
  const flash = useFlash(!!highlighted);

  if (message.deleted) {
    return (
      <View style={[styles.row, mine && styles.rowMine]}>
        <View style={[styles.bubble, mine ? styles.mineDeleted : styles.theirs, styles.deleted]}>
          <Ban size={14} color={mine ? 'rgba(255,255,255,0.8)' : colors.textSubtle} />
          <Text variant="small" color={mine ? 'rgba(255,255,255,0.85)' : colors.textMuted} style={styles.italic}>
            {t('deleted')}
          </Text>
        </View>
      </View>
    );
  }

  const tight = !!media && (message.type === 'image' || message.type === 'video');
  const onPress =
    media && (message.type === 'image' || message.type === 'video')
      ? () => onOpenMedia(message)
      : media && message.type === 'file'
        ? () => onOpenFile(message)
        : undefined;

  return (
    <SwipeReply onReply={() => onReply(message)}>
    <View style={[styles.row, mine && styles.rowMine]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.flashBg, { opacity: flash }]} pointerEvents="none" />
      <View style={styles.bubbleCol}>
        <Touchable
          onPress={onPress}
          onLongPress={() => onLongPress(message)}
          delayLongPress={300}
          pressScale={false}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityHint={t('messageActions')}
          style={[styles.bubble, mine ? styles.mine : styles.theirs, tight && styles.tight]}>
          {replyTo && (
            <Pressable onPress={() => onJump(replyTo.id)} accessibilityRole="button" style={[styles.quote, mine ? styles.quoteMine : styles.quoteTheirs, tight && styles.quoteTight]}>
              <Text variant="caption" weight="bold" color={mine ? colors.onPrimary : colors.primaryText} numberOfLines={1}>
                {replyTo.sender === 'me' ? t('you') : replyName}
              </Text>
              <Text variant="caption" color={mine ? 'rgba(255,255,255,0.85)' : colors.textMuted} numberOfLines={2}>
                {preview(replyTo)}
              </Text>
            </Pressable>
          )}

          {media && message.type === 'image' && (
            <View>
              <Image source={{ uri: media.url }} style={[styles.photo, { width: w, height: mediaHeight(w, media.width, media.height) }]} accessibilityLabel={t('photo')} accessibilityIgnoresInvertColors />
              {!message.text && <Meta message={message} mine={mine} overlay />}
            </View>
          )}
          {media && message.type === 'video' && (
            <VideoTile w={w} h={mediaHeight(w, media.width, media.height)} durationMs={media.durationMs}>
              <View style={styles.playBig} accessibilityLabel={t('playVideo')}>
                <Play size={26} color="#fff" fill="#fff" style={styles.playNudge} />
              </View>
              {!message.text && <Meta message={message} mine={mine} overlay />}
            </VideoTile>
          )}
          {media && message.type === 'file' && <FileRow name={media.name} size={media.size} mine={mine} />}
          {media && message.type === 'voice' && <VoiceNote id={message.id} uri={media.url} durationMs={media.durationMs} mine={mine} onError={onPlayError} />}

          {!!message.text && (
            <Text
              color={fg}
              align="auto"
              style={[tight && styles.caption, { writingDirection: isRtlText(message.text) ? 'rtl' : 'ltr' }]}>
              {message.text}
            </Text>
          )}
          {(!tight || !!message.text) && (
            <View style={tight && styles.caption}>
              <Meta message={message} mine={mine} />
            </View>
          )}
        </Touchable>
        {message.reactions.length > 0 && (
          <View style={[styles.reactions, mine ? styles.reactionsMine : null]}>
            <Text variant="small">{message.reactions.map(r => r.emoji).join(' ')}</Text>
          </View>
        )}
      </View>
    </View>
    </SwipeReply>
  );
});

/* ---- Upload in progress ----------------------------------------------------- */

export function useUploadStatus() {
  const t = useT('mobile.chat');
  return (job: ChatUpload) => {
    const done = formatBytes(job.offset);
    const total = formatBytes(job.file.size);
    switch (job.state) {
      case 'paused':
        return t('paused', { done, total });
      case 'waiting':
        return t('waiting');
      case 'failed':
        return t('failed');
      case 'sending':
        return t('sending');
      default:
        return `${t('uploading', { done, total })} · ${Math.floor((job.offset / job.file.size) * 100)}%`;
    }
  };
}

/**
 * A media message still on its way up. The ring shows progress; tapping it
 * pauses, and tapping again (or after a failure) resumes from the last chunk
 * the server confirmed. Long-press offers Cancel.
 */
export function UploadBubble({ job, onToggle, onLongPress, onOpenMedia }: { job: ChatUpload; onToggle: (j: ChatUpload) => void; onLongPress: (j: ChatUpload) => void; onOpenMedia: (m: ViewerMedia[]) => void }) {
  const t = useT('mobile.chat');
  const status = useUploadStatus();
  const w = useMediaWidth();
  const moving = job.state === 'uploading' || job.state === 'sending' || job.state === 'waiting';
  const progress = job.offset / job.file.size;
  const icon = job.state === 'failed' ? RotateCw : moving ? Pause : ArrowUp;
  const label = moving ? t('pause') : t('resume');
  const spinning = job.state === 'waiting' || (job.state === 'uploading' && job.offset === 0) || job.state === 'sending';
  const failed = job.state === 'failed';
  const statusLine = (
    <Text variant="caption" numeric={!failed && job.state !== 'waiting'} color={failed ? '#ffd5d5' : 'rgba(255,255,255,0.85)'} numberOfLines={2}>
      {status(job)}
    </Text>
  );
  const ring = (onMedia: boolean) => (
    <ProgressRing
      progress={progress}
      spinning={spinning}
      color="#fff"
      track={onMedia ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.18)'}
      icon={icon}
      label={label}
      onPress={() => onToggle(job)}
      size={onMedia ? 56 : 44}
    />
  );
  const visual = job.type === 'image' || job.type === 'video';
  const h = mediaHeight(w, job.width, job.height);

  return (
    <View style={[styles.row, styles.rowMine]}>
      <View style={styles.bubbleCol}>
      <Touchable
        onLongPress={() => onLongPress(job)}
        onPress={visual ? () => onOpenMedia([{ kind: job.type === 'video' ? 'video' : 'image', uri: job.file.uri }]) : undefined}
        delayLongPress={300}
        pressScale={false}
        accessibilityHint={t('messageActions')}
        style={[styles.bubble, styles.mine, visual && styles.tight]}>
        {job.type === 'image' && (
          <View>
            <Image source={{ uri: job.file.uri }} style={[styles.photo, { width: w, height: h }]} accessibilityIgnoresInvertColors />
            <View style={[StyleSheet.absoluteFill, styles.center, styles.dim]}>{ring(true)}</View>
          </View>
        )}
        {job.type === 'video' && (
          <VideoTile w={w} h={h} durationMs={job.durationMs}>
            <View style={[StyleSheet.absoluteFill, styles.center]}>{ring(true)}</View>
          </VideoTile>
        )}
        {job.type === 'file' && <FileRow name={job.file.name} size={job.file.size} mine lead={ring(false)} />}
        {job.type === 'voice' && (
          <View style={styles.voice}>
            {ring(false)}
            <View style={styles.flex}>
              <Text weight="semibold" color={colors.onPrimary} numberOfLines={1}>
                {t('voice')}
              </Text>
              {!!job.durationMs && (
                <Text variant="caption" numeric color="rgba(255,255,255,0.85)">
                  {formatDuration(job.durationMs)}
                </Text>
              )}
            </View>
            <Mic size={18} color="rgba(255,255,255,0.7)" />
          </View>
        )}
        <View style={[styles.uploadLine, visual && styles.caption]}>{statusLine}</View>
      </Touchable>
      </View>
    </View>
  );
}

/* ---- Day divider ------------------------------------------------------------ */

export function DayDivider({ label }: { label: string }) {
  return (
    <View style={styles.day}>
      <View style={styles.dayPill}>
        <Text variant="caption" weight="semibold" color={colors.textMuted} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    ringFill: { position: 'absolute' },
    swipeIcon: { position: 'absolute', start: space.md, top: 0, bottom: 0, justifyContent: 'center' },
    flashBg: { backgroundColor: colors.primarySoft },
    row: { flexDirection: 'row', paddingHorizontal: space.md, marginVertical: 3 },
    rowMine: { justifyContent: 'flex-end' },
    // One width limit for both sides, so the two columns line up with the screen edges.
    bubbleCol: { maxWidth: '80%' },
    bubble: { maxWidth: '100%', borderRadius: radius.lg, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: 6, gap: 4, overflow: 'hidden' },
    mine: { backgroundColor: colors.primary, borderBottomEndRadius: 6 },
    mineDeleted: { backgroundColor: colors.primary, opacity: 0.7, borderBottomEndRadius: 6 },
    theirs: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, borderBottomStartRadius: 6 },
    tight: { padding: 3, paddingBottom: 3 },
    caption: { paddingHorizontal: space.sm, paddingBottom: 3 },
    deleted: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: space.sm },
    italic: { fontStyle: 'italic' },
    meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, alignSelf: 'flex-end' },
    metaOverlay: { position: 'absolute', bottom: 6, end: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
    quote: { borderStartWidth: 3, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 4 },
    quoteMine: { borderStartColor: 'rgba(255,255,255,0.75)', backgroundColor: 'rgba(255,255,255,0.14)' },
    quoteTheirs: { borderStartColor: colors.primaryText, backgroundColor: colors.primarySoft },
    quoteTight: { margin: 3 },
    photo: { borderRadius: radius.md, backgroundColor: inkFixed[800] },
    dim: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: radius.md },
    video: { borderRadius: radius.md, backgroundColor: inkFixed[900], alignItems: 'center', justifyContent: 'center' },
    videoGlyph: { position: 'absolute', top: space.md, start: space.md },
    videoMeta: { position: 'absolute', bottom: 6, start: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
    playBig: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
    playNudge: { marginStart: 2 },
    file: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, padding: space.sm, minWidth: 220 },
    fileIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    voice: { flexDirection: 'row', alignItems: 'center', gap: space.md, minWidth: 230, paddingVertical: 2 },
    voiceBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    voiceTrackHit: { width: VOICE_BAR, paddingVertical: 8 },
    voiceTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
    voiceProgress: { height: 4, borderRadius: 2 },
    uploadLine: { paddingTop: 2 },
    reactions: { alignSelf: 'flex-start', marginTop: -6, marginStart: space.sm, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, paddingHorizontal: 6, paddingVertical: 1 },
    reactionsMine: { alignSelf: 'flex-end', marginEnd: space.sm },
    day: { alignItems: 'center', marginVertical: space.md },
    dayPill: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  }),
);
