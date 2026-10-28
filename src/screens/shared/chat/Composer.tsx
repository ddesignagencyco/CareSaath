import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Linking, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { useDeviceErrorText } from '../../../components/FilePickerSheet';
import { Camera, FileImage, FileText, Keyboard as KeyboardIcon, Mic, Paperclip, Pause, Play, Send, Smile, Trash, Video, X } from '../../../components/icons';
import { Sheet, useToast } from '../../../components/overlay';
import { Text, useTextStyle } from '../../../components/Text';
import { Card, Divider, DirIcon, IconButton, ListRow, Touchable } from '../../../components/ui';
import { useSettings, useT } from '../../../i18n';
import { fileSize, pickChatDocument, pickChatPhoto, pickChatVideo, type ChatPick } from '../../../lib/files';
import { ensureMicPermission, formatDuration, MAX_VOICE_MS, recorder } from '../../../lib/voice';
import { colors, feedback, radius, space, themed } from '../../../theme';
import type { ChatMessage } from '../../../api/chat/types';
import { usePreview } from './common';

export type Outgoing =
  | { kind: 'text'; text: string }
  | { kind: 'media'; type: 'image' | 'video' | 'file' | 'voice'; file: ChatPick };

/** Voice notes shorter than this are treated as an accidental tap. */
const MIN_VOICE_MS = 1000;

/** Same set as the web chat, with care-related ones (pill, ambulance…) included. */
// prettier-ignore
const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😅','😎','🤩','🥳','🤗','🤔','😴','😇','🙂','😢','😭','😡','🙄','😬','😳','👍','👎','👏','🙏','💪','🙌','👌','🤝','✌️','🤞','❤️','🧡','💛','💚','💙','💜','🔥','✨','🎉','✅','❌','⚠️','⏰','📍','📞','💊','🩺','🚑','🏥','🧓','👶','🍵','🌙','☀️'];

/**
 * Message bar, as in WhatsApp: emoji and camera inside the text box, attach
 * (photo, video, document), and a mic that turns into Send once there's text.
 * Recording replaces the box with a timer plus Discard, Pause/Resume and Send,
 * so a note is never sent by accident.
 */
export function Composer({
  onSend,
  replyTo,
  replyName,
  onCancelReply,
}: {
  onSend: (o: Outgoing) => void;
  replyTo: ChatMessage | null;
  replyName: string;
  onCancelReply: () => void;
}) {
  const t = useT('mobile.chat');
  const toast = useToast();
  const errorText = useDeviceErrorText();
  const preview = usePreview();
  const { isRTL } = useSettings();
  const font = useTextStyle('body');
  const [text, setText] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recordingMs, setRecordingMs] = useState<number | null>(null);
  const [recPaused, setRecPaused] = useState(false);
  const busy = useRef(false);
  const input = useRef<TextInputInstance>(null);
  const selection = useRef({ start: 0, end: 0 });
  /** Live elapsed time; the tick callback can't see fresh state. */
  const elapsed = useRef<number | null>(null);

  // Leaving the chat mid-recording throws the note away.
  useEffect(
    () => () => {
      recorder.cancel().catch(() => {});
    },
    [],
  );

  // Swipe / Reply opens the keyboard, ready to type the answer.
  useEffect(() => {
    if (replyTo && !emojiOpen) input.current?.focus();
  }, [replyTo, emojiOpen]);

  const pick = async (type: 'image' | 'video' | 'file', fn: () => Promise<ChatPick | null>) => {
    if (busy.current) return;
    busy.current = true;
    setAttachOpen(false);
    try {
      const file = await fn();
      if (file) onSend({ kind: 'media', type, file });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      busy.current = false;
    }
  };

  const startRecording = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!(await ensureMicPermission())) {
        toast.error(t('micPermission'));
        Linking.openSettings().catch(() => {});
        return;
      }
      setEmojiOpen(false);
      Keyboard.dismiss();
      elapsed.current = 0;
      setRecPaused(false);
      setRecordingMs(0);
      await recorder.start(ms => {
        if (elapsed.current === null) return;
        elapsed.current = ms;
        setRecordingMs(ms);
        if (ms >= MAX_VOICE_MS) finishRecording(true);
      });
    } catch {
      elapsed.current = null;
      setRecordingMs(null);
      toast.error(t('recordFailed'));
    } finally {
      busy.current = false;
    }
  };

  const togglePause = async () => {
    try {
      if (recPaused) await recorder.resume();
      else await recorder.pause();
      setRecPaused(p => !p);
    } catch {
      toast.error(t('recordFailed'));
    }
  };

  const finishRecording = async (send: boolean) => {
    const ms = elapsed.current;
    // Already finished (max length reached, or a double tap).
    if (ms === null) return;
    elapsed.current = null;
    setRecordingMs(null);
    setRecPaused(false);
    if (!send) {
      await recorder.cancel();
      return;
    }
    try {
      const uri = await recorder.stop();
      if (ms < MIN_VOICE_MS) {
        toast.info(t('tooShort'));
        return;
      }
      const size = await fileSize(uri);
      onSend({ kind: 'media', type: 'voice', file: { uri, name: `voice-${Date.now()}.m4a`, type: 'audio/mp4', size, durationMs: ms } });
    } catch {
      toast.error(t('recordFailed'));
    }
  };

  const sendText = () => {
    const v = text.trim();
    if (!v) return;
    onSend({ kind: 'text', text: v });
    setText('');
    selection.current = { start: 0, end: 0 };
  };

  /** Emoji go in at the cursor, not always at the end. */
  const insertEmoji = (e: string) => {
    const { start, end } = selection.current;
    const next = text.slice(0, start) + e + text.slice(end);
    setText(next);
    selection.current = { start: start + e.length, end: start + e.length };
  };

  const toggleEmoji = () => {
    if (emojiOpen) {
      setEmojiOpen(false);
      input.current?.focus();
    } else {
      Keyboard.dismiss();
      setEmojiOpen(true);
    }
  };

  const recording = recordingMs !== null;
  const hasText = text.trim().length > 0;

  return (
    <View style={styles.wrap}>
      {replyTo && !recording && (
        <View style={styles.reply}>
          <View style={styles.replyBar} />
          <View style={styles.flex}>
            <Text variant="caption" weight="bold" color={colors.primaryText} numberOfLines={1}>
              {t('replyingTo', { name: replyTo.sender === 'me' ? t('you') : replyName })}
            </Text>
            <Text variant="small" color={colors.textMuted} numberOfLines={1}>
              {preview(replyTo)}
            </Text>
          </View>
          <IconButton icon={X} label={t('cancelReply')} onPress={onCancelReply} size={20} />
        </View>
      )}

      <View style={styles.bar}>
        {recording ? (
          <>
            <IconButton icon={Trash} label={t('discardRecording')} color={feedback.danger600} onPress={() => finishRecording(false)} />
            <View style={styles.recording} accessibilityLiveRegion="polite">
              <View style={[styles.recDot, recPaused && styles.recDotPaused]} />
              <Text weight="semibold" numberOfLines={1} style={styles.flex}>
                {recPaused ? t('recordingPaused') : t('recording')}
              </Text>
              <Text weight="semibold" numeric tabular>
                {formatDuration(recordingMs ?? 0)}
              </Text>
            </View>
            <IconButton icon={recPaused ? Mic : Pause} label={recPaused ? t('resumeRecording') : t('pauseRecording')} onPress={togglePause} />
          </>
        ) : (
          <>
            <View style={styles.inputWrap}>
              <IconButton icon={emojiOpen ? KeyboardIcon : Smile} label={emojiOpen ? t('keyboard') : t('emoji')} onPress={toggleEmoji} size={22} />
              <TextInput
                ref={input}
                value={text}
                onChangeText={setText}
                onSelectionChange={e => {
                  selection.current = e.nativeEvent.selection;
                }}
                onFocus={() => setEmojiOpen(false)}
                placeholder={t('placeholder')}
                placeholderTextColor={colors.textSubtle}
                multiline
                maxLength={4000}
                accessibilityLabel={t('placeholder')}
                style={[styles.input, { fontFamily: font.fontFamily, fontSize: font.fontSize, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' }]}
              />
              <IconButton icon={Paperclip} label={t('attach')} onPress={() => setAttachOpen(true)} size={22} />
              {!hasText && <IconButton icon={Camera} label={t('takePhoto')} onPress={() => pick('image', () => pickChatPhoto('camera'))} size={22} />}
            </View>
          </>
        )}
        <Touchable
          onPress={recording ? () => finishRecording(true) : hasText ? sendText : startRecording}
          accessibilityRole="button"
          accessibilityLabel={recording ? t('sendVoice') : hasText ? t('send') : t('recordVoice')}
          style={styles.send}
          rippleColor="rgba(255,255,255,0.2)">
          {recording || hasText ? <DirIcon icon={Send} size={20} color={colors.onPrimary} strokeWidth={2.2} /> : <Mic size={22} color={colors.onPrimary} strokeWidth={2.2} />}
        </Touchable>
      </View>

      {emojiOpen && !recording && (
        <ScrollView style={styles.emojiPanel} contentContainerStyle={styles.emojiGrid} keyboardShouldPersistTaps="always">
          {EMOJIS.map(e => (
            <Pressable key={e} onPress={() => insertEmoji(e)} accessibilityRole="button" accessibilityLabel={e} style={({ pressed }) => [styles.emoji, pressed && styles.emojiPressed]}>
              <Text variant="h2" align="center" allowFontScaling={false}>
                {e}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Sheet visible={attachOpen} onClose={() => setAttachOpen(false)} title={t('attach')}>
        <Card padded={false}>
          <ListRow icon={Camera} tone="teal" title={t('takePhoto')} onPress={() => pick('image', () => pickChatPhoto('camera'))} />
          <Divider inset={space.lg} />
          <ListRow icon={Video} tone="marigold" title={t('recordVideo')} onPress={() => pick('video', () => pickChatVideo('camera'))} />
          <Divider inset={space.lg} />
          <ListRow icon={FileImage} tone="mint" title={t('photoFromGallery')} onPress={() => pick('image', () => pickChatPhoto('library'))} />
          <Divider inset={space.lg} />
          <ListRow icon={Play} tone="sand" title={t('videoFromGallery')} onPress={() => pick('video', () => pickChatVideo('library'))} />
          <Divider inset={space.lg} />
          <ListRow icon={FileText} tone="ink" title={t('document')} onPress={() => pick('file', pickChatDocument)} />
        </Card>
        <Text variant="small" color={colors.textMuted}>
          {t('attachHint')}
        </Text>
      </Sheet>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    wrap: { gap: space.sm },
    reply: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, paddingStart: space.sm },
    replyBar: { width: 3, alignSelf: 'stretch', marginVertical: space.sm, borderRadius: 2, backgroundColor: colors.primaryText },
    bar: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
    // 2 + 44 + 2 = the 48 pt send button, so icons, text and Send share one baseline.
    inputWrap: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.surfaceMuted, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 2, paddingVertical: 2 },
    input: { flex: 1, minHeight: 44, color: colors.text, paddingVertical: 10, paddingHorizontal: 0, maxHeight: 128, textAlignVertical: 'center' },
    recording: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: feedback.danger50, borderRadius: 23, paddingHorizontal: space.lg },
    recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: feedback.danger600 },
    recDotPaused: { backgroundColor: colors.textSubtle },
    send: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    emojiPanel: { maxHeight: 232 },
    emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    emoji: { width: '12.5%', height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
    emojiPressed: { backgroundColor: colors.surfaceMuted },
  }),
);
