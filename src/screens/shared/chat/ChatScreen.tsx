import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CHAT_USE_MOCKS } from '../../../api/config';
import { chatApi } from '../../../api/chat/api';
import { chatKeys } from '../../../api/chat/keys';
import type { ChatMessage } from '../../../api/chat/types';
import { HeroBand } from '../../../components/brand';
import { ArrowUp, Copy, CornerUpLeft, MessagesSquare, Pause, Phone, Trash, Video, X } from '../../../components/icons';
import { ConfirmSheet, Sheet, useToast } from '../../../components/overlay';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../../components/screen';
import { Text } from '../../../components/Text';
import { Avatar, Card, DirChevron, Divider, IconButton, ListRow, OnDark, Touchable } from '../../../components/ui';
import { localDayKey, useFmt } from '../../../i18n/format';
import { useT } from '../../../i18n';
import { invalidate, useApiErrorText, useQuery } from '../../../lib/query';
import { uploads, useConversationUploads, type ChatUpload } from '../../../lib/uploads';
import { formatDuration, player } from '../../../lib/voice';
import type { ChatRoutes } from '../../../navigation/types';
import { brandFixed, colors, radius, space, themed } from '../../../theme';
import { DayDivider, MessageBubble, UploadBubble } from './Bubble';
import { CallScreen } from './CallScreen';
import { useChatNav, useChatScope, usePeerRole } from './common';
import { Composer, type Outgoing } from './Composer';
import { DocumentSheet, MediaViewer, toViewerMedia, type ViewerMedia } from './MediaViewer';

/** Same quick set as the web chat. */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

type Item = { kind: 'msg'; key: string; m: ChatMessage } | { kind: 'up'; key: string; j: ChatUpload } | { kind: 'day'; key: string; label: string };

export function ChatScreen({ route }: NativeStackScreenProps<ChatRoutes, 'Chat'>) {
  const { id, name } = route.params;
  const t = useT('mobile.chat');
  const tl = useT('labels.time');
  const f = useFmt();
  const toast = useToast();
  const apiError = useApiErrorText();
  const role = usePeerRole();
  const nav = useChatNav();
  const scope = useChatScope();
  const api = useMemo(() => chatApi(scope), [scope]);

  const conv = useQuery(chatKeys.conversation(scope, id), () => api.conversation(id));
  const msgs = useQuery(chatKeys.messages(scope, id), () => api.messages(id));
  const jobs = useConversationUploads(scope, id);
  const list = useRef<FlatList<Item>>(null);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChatMessage | null>(null);
  const [uploadFor, setUploadFor] = useState<ChatUpload | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<ChatUpload | null>(null);
  const [viewer, setViewer] = useState<{ items: ViewerMedia[]; index: number } | null>(null);
  const [doc, setDoc] = useState<ChatMessage | null>(null);
  const [call, setCall] = useState<{ video: boolean } | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const peer = conv.data?.peer;
  const peerName = peer?.name ?? name;
  const count = msgs.data?.length ?? 0;

  // Opening the chat (and each new message while it's open) marks it read.
  useEffect(() => {
    api
      .markRead(id)
      .then(() => invalidate(chatKeys.conversations(scope)))
      .catch(() => {});
  }, [api, id, scope, count]);

  // No chat socket on the backend yet: poll while the chat is on screen.
  useFocusEffect(
    useCallback(() => {
      if (CHAT_USE_MOCKS) return;
      const timer = setInterval(() => invalidate(chatKeys.messages(scope, id)), 5000);
      return () => clearInterval(timer);
    }, [scope, id]),
  );

  // Leaving the chat stops a playing voice note.
  useEffect(
    () => () => {
      player.stop().catch(() => {});
    },
    [],
  );

  const byId = useMemo(() => new Map((msgs.data ?? []).map(m => [m.id, m])), [msgs.data]);
  const media = useMemo(() => toViewerMedia(msgs.data ?? [], m => (m.sender === 'me' ? t('you') : peerName), f.dateTime), [msgs.data, t, peerName, f]);

  // Oldest → newest with day dividers, then reversed for the inverted list
  // (newest at the bottom, list starts scrolled there).
  const items = useMemo(() => {
    const out: Item[] = [];
    let lastDay = '';
    const today = localDayKey(Date.now());
    const yesterday = localDayKey(Date.now() - 86_400_000);
    const day = (iso: string) => {
      const k = localDayKey(new Date(iso).getTime());
      if (k === lastDay) return;
      lastDay = k;
      out.push({ kind: 'day', key: `day-${k}`, label: k === today ? tl('today') : k === yesterday ? tl('yesterday') : f.date(iso) });
    };
    for (const m of msgs.data ?? []) {
      day(m.createdAt);
      out.push({ kind: 'msg', key: m.id, m });
    }
    for (const j of jobs) {
      day(j.createdAt);
      out.push({ kind: 'up', key: j.id, j });
    }
    return out.reverse();
  }, [msgs.data, jobs, f, tl]);

  const send = useCallback(
    (o: Outgoing) => {
      const reply = replyTo?.id;
      setReplyTo(null);
      if (o.kind === 'text') {
        api
          .send(id, { type: 'text', text: o.text, replyToId: reply })
          .then(() => invalidate(chatKeys.root(scope)))
          .catch(e => toast.error(apiError(e)));
        return;
      }
      uploads.add({
        scope,
        conversationId: id,
        type: o.type,
        file: { uri: o.file.uri, name: o.file.name, mimeType: o.file.type, size: o.file.size },
        durationMs: o.file.durationMs,
        width: o.file.width,
        height: o.file.height,
        replyToId: reply,
      });
    },
    [api, id, scope, replyTo, toast, apiError],
  );

  const react = (m: ChatMessage, emoji: string) => {
    setActionsFor(null);
    api
      .react(m.id, emoji)
      .then(() => invalidate(chatKeys.messages(scope, id)))
      .catch(e => toast.error(apiError(e)));
  };

  const remove = (m: ChatMessage) => {
    setConfirmDelete(null);
    api
      .remove(m.id)
      .then(() => invalidate(chatKeys.root(scope)))
      .catch(e => toast.error(apiError(e)));
  };

  const toggleUpload = useCallback((j: ChatUpload) => {
    if (j.state === 'uploading' || j.state === 'waiting') uploads.pause(j.id);
    else if (j.state !== 'sending') uploads.resume(j.id);
  }, []);

  const openMedia = useCallback(
    (m: ChatMessage) => {
      const index = media.findIndex(x => x.id === m.id);
      if (index >= 0) setViewer({ items: media, index });
    },
    [media],
  );
  const openUploadMedia = useCallback((items: ViewerMedia[]) => setViewer({ items: items.map(i => ({ ...i, title: t('you') })), index: 0 }), [t]);
  const playError = useCallback(() => toast.error(t('playFailed')), [toast, t]);

  /** Tap on a reply quote: scroll to the original and tint it for a moment. */
  const jump = useCallback(
    (messageId: string) => {
      const index = items.findIndex(i => i.key === messageId);
      if (index < 0) {
        toast.info(t('jumpFailed'));
        return;
      }
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      setFlashId(null);
      requestAnimationFrame(() => setFlashId(messageId));
    },
    [items, toast, t],
  );

  const renderItem = useCallback(
    ({ item }: { item: Item }) => {
      if (item.kind === 'day') return <DayDivider label={item.label} />;
      if (item.kind === 'up') return <UploadBubble job={item.j} onToggle={toggleUpload} onLongPress={setUploadFor} onOpenMedia={openUploadMedia} />;
      const m = item.m;
      return (
        <MessageBubble
          message={m}
          replyTo={m.replyToId ? byId.get(m.replyToId) : undefined}
          replyName={peerName}
          onLongPress={setActionsFor}
          onOpenMedia={openMedia}
          onOpenFile={setDoc}
          onPlayError={playError}
          onReply={setReplyTo}
          onJump={jump}
          highlighted={flashId === m.id}
        />
      );
    },
    [byId, peerName, toggleUpload, openMedia, openUploadMedia, playError, jump, flashId],
  );

  const subtitle = conv.data ? (conv.data.online ? t('online') : role(conv.data.peer.role)) : undefined;
  const empty = !msgs.isLoading && !msgs.error && items.length === 0;

  return (
    <Screen
      header={
        <ChatHeader
          name={peerName}
          subtitle={subtitle}
          photoUrl={peer?.photoUrl}
          onInfo={() => nav.navigate('ChatMedia', { id, name: peerName })}
          onCall={video => setCall({ video })}
        />
      }
      scroll={false}
      footer={<Composer onSend={send} replyTo={replyTo} replyName={peerName} onCancelReply={() => setReplyTo(null)} />}>
      {msgs.isLoading ? (
        <View style={styles.pad}>
          <SkeletonList count={4} height={52} />
        </View>
      ) : msgs.error && !msgs.data ? (
        <ErrorState error={msgs.error} onRetry={msgs.refetch} />
      ) : empty ? (
        <EmptyState icon={MessagesSquare} title={peerName} text={t('noMessages')} />
      ) : (
        <FlatList
          ref={list}
          inverted
          data={items}
          keyExtractor={i => i.key}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          initialNumToRender={20}
          windowSize={9}
          onScrollToIndexFailed={e => {
            // Not laid out yet: get close, then try again.
            list.current?.scrollToOffset({ offset: e.averageItemLength * e.index, animated: false });
            setTimeout(() => list.current?.scrollToIndex({ index: e.index, viewPosition: 0.5, animated: true }), 120);
          }}
        />
      )}

      {/* Message actions: react, reply, copy, delete (own messages). */}
      <Sheet visible={!!actionsFor} onClose={() => setActionsFor(null)} title={t('messageActions')}>
        <View style={styles.reactRow}>
          {QUICK_REACTIONS.map(e => {
            const on = actionsFor?.reactions.some(r => r.byMe && r.emoji === e);
            return (
              <Touchable key={e} onPress={() => actionsFor && react(actionsFor, e)} accessibilityRole="button" accessibilityLabel={e} style={[styles.reactBtn, on && styles.reactOn]}>
                <Text variant="title" allowFontScaling={false}>
                  {e}
                </Text>
              </Touchable>
            );
          })}
        </View>
        <Card padded={false}>
          <ListRow
            icon={CornerUpLeft}
            title={t('reply')}
            onPress={() => {
              setReplyTo(actionsFor);
              setActionsFor(null);
            }}
          />
          {!!actionsFor?.text && (
            <>
              <Divider inset={space.lg} />
              <ListRow
                icon={Copy}
                title={t('copy')}
                onPress={() => {
                  Clipboard.setString(actionsFor.text ?? '');
                  setActionsFor(null);
                  toast.success(t('copied'));
                }}
              />
            </>
          )}
          {actionsFor?.sender === 'me' && (
            <>
              <Divider inset={space.lg} />
              <ListRow
                icon={Trash}
                danger
                title={t('delete')}
                onPress={() => {
                  setConfirmDelete(actionsFor);
                  setActionsFor(null);
                }}
              />
            </>
          )}
        </Card>
      </Sheet>
      <ConfirmSheet
        visible={!!confirmDelete}
        title={t('deleteTitle')}
        body={t('deleteBody')}
        confirmLabel={t('delete')}
        danger
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />

      {/* Upload actions: pause / resume, cancel. */}
      <Sheet visible={!!uploadFor} onClose={() => setUploadFor(null)} title={uploadFor?.file.name}>
        <Card padded={false}>
          {uploadFor && uploadFor.state !== 'sending' && (
            <>
              <ListRow
                icon={uploadFor.state === 'uploading' || uploadFor.state === 'waiting' ? Pause : ArrowUp}
                title={uploadFor.state === 'uploading' || uploadFor.state === 'waiting' ? t('pause') : t('resume')}
                onPress={() => {
                  toggleUpload(uploadFor);
                  setUploadFor(null);
                }}
              />
              <Divider inset={space.lg} />
            </>
          )}
          <ListRow
            icon={X}
            danger
            title={t('cancelUpload')}
            onPress={() => {
              setConfirmCancel(uploadFor);
              setUploadFor(null);
            }}
          />
        </Card>
      </Sheet>
      <ConfirmSheet
        visible={!!confirmCancel}
        title={t('cancelUploadTitle')}
        body={t('cancelUploadBody')}
        confirmLabel={t('cancelUpload')}
        danger
        onConfirm={() => {
          if (confirmCancel) uploads.cancel(confirmCancel.id);
          setConfirmCancel(null);
        }}
        onClose={() => setConfirmCancel(null)}
      />

      <MediaViewer items={viewer?.items ?? null} index={viewer?.index ?? 0} onClose={() => setViewer(null)} />
      <DocumentSheet message={doc} onClose={() => setDoc(null)} />
      <CallScreen
        call={call}
        name={peerName}
        photoUrl={peer?.photoUrl}
        onEnd={secs => {
          setCall(null);
          if (secs > 0) toast.info(t('callEnded', { time: formatDuration(secs * 1000) }));
        }}
      />
    </Screen>
  );
}

/**
 * WhatsApp-style chat bar on the brand teal: back, the other person's photo
 * and name (tap for shared media and documents), video and voice call.
 */
function ChatHeader({ name, subtitle, photoUrl, onInfo, onCall }: { name: string; subtitle?: string; photoUrl?: string | null; onInfo: () => void; onCall: (video: boolean) => void }) {
  const navigation = useNavigation();
  const t = useT('mobile.chat');
  const tc = useT('common.actions');
  return (
    <OnDark.Provider value>
      <HeroBand style={styles.band}>
        <View style={styles.headerRow}>
          <Touchable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={tc('back')} hitSlop={4} rippleColor="rgba(255,255,255,0.2)" style={styles.back}>
            <DirChevron back color="#fff" size={24} />
          </Touchable>
          <Touchable onPress={onInfo} accessibilityRole="button" accessibilityLabel={`${name}, ${t('viewMedia')}`} pressScale={false} rippleColor="rgba(255,255,255,0.15)" style={styles.who}>
            <Avatar name={name} uri={photoUrl} size={40} />
            <View style={styles.flex}>
              <Text weight="bold" color="#fff" numberOfLines={1}>
                {name}
              </Text>
              {!!subtitle && (
                <Text variant="caption" color={brandFixed[100]} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>
          </Touchable>
          <IconButton icon={Video} label={t('videoCall')} onPress={() => onCall(true)} />
          <IconButton icon={Phone} label={t('voiceCall')} onPress={() => onCall(false)} />
        </View>
      </HeroBand>
    </OnDark.Provider>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    pad: { padding: space.lg },
    list: { paddingVertical: space.md },
    band: { paddingHorizontal: space.sm, paddingBottom: space.md },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 2, paddingEnd: space.xs, borderRadius: radius.md },
    reactRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, padding: space.xs },
    reactBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    reactOn: { backgroundColor: colors.primarySoft },
  }),
);
