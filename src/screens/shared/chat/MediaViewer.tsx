import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, Modal, StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import Video from 'react-native-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatMessage } from '../../../api/chat/types';
import { CircleCheck, ChevronLeft, ChevronRight, CircleAlert, Download, FileText, X } from '../../../components/icons';
import { Sheet, useToast } from '../../../components/overlay';
import { Text } from '../../../components/Text';
import { Button, IconButton, OnDark, Touchable } from '../../../components/ui';
import { formatBytes } from '../../../i18n/format';
import { GalleryError, saveToGallery } from '../../../lib/gallery';
import { useT } from '../../../i18n';
import { colors, radius, space, themed } from '../../../theme';

/** `title` is who sent it and `subtitle` when (like WhatsApp), never the file name. */
export type ViewerMedia = { kind: 'image' | 'video'; uri: string; title?: string; subtitle?: string; id?: string };

/** Photos and videos of a conversation, oldest first, for the pager. */
export const toViewerMedia = (messages: ChatMessage[], sender: (m: ChatMessage) => string, when: (iso: string) => string): ViewerMedia[] =>
  messages
    .filter(m => !m.deleted && m.media && (m.type === 'image' || m.type === 'video'))
    .map(m => ({ id: m.id, kind: m.type === 'video' ? 'video' : 'image', uri: m.media!.url, title: sender(m), subtitle: when(m.createdAt) }));

/**
 * Full-screen photos and videos on black. Swipe sideways (or use the arrows)
 * through every photo and video in the chat, like WhatsApp; only the video on
 * screen plays. Android back closes it.
 */
export function MediaViewer({ items, index, onClose }: { items: ViewerMedia[] | null; index: number; onClose: () => void }) {
  if (!items?.length) return null;
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <StatusBar barStyle="light-content" />
      <Pager items={items} start={Math.max(0, Math.min(index, items.length - 1))} onClose={onClose} />
    </Modal>
  );
}

function Pager({ items, start, onClose }: { items: ViewerMedia[]; start: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tc = useT('common.actions');
  const t = useT('mobile.chat');
  const [current, setCurrent] = useState(start);
  const [saving, setSaving] = useState(false);
  // The app's toasts sit under this modal, so feedback shows here.
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const list = useRef<FlatList<ViewerMedia>>(null);
  const save = async () => {
    const it = items[current];
    if (!it || saving) return;
    setSaving(true);
    try {
      await saveToGallery(it.uri, it.kind);
      setNotice({ ok: true, text: t('saved') });
    } catch (e) {
      setNotice({ ok: false, text: e instanceof GalleryError && e.code === 'permission' ? t('savePermission') : t('saveFailed') });
    } finally {
      setSaving(false);
      setTimeout(() => setNotice(null), 2500);
    }
  };
  const go = (i: number) => {
    if (i < 0 || i >= items.length) return;
    list.current?.scrollToIndex({ index: i, animated: true });
    setCurrent(i);
  };
  const m = items[current];

  return (
    <View style={styles.fill}>
      <FlatList
        ref={list}
        data={items}
        horizontal
        pagingEnabled
        // A gallery runs left-to-right on screen in both languages.
        style={styles.ltr}
        initialScrollIndex={start}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(it, i) => `${it.uri}-${i}`}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index }) => <Page item={item} width={width} active={index === current} />}
      />
      <OnDark.Provider value>
        <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
          <IconButton icon={X} label={tc('close')} onPress={onClose} bg="rgba(0,0,0,0.45)" />
          <View style={styles.flex}>
            {!!m?.title && (
              <Text weight="bold" color="#fff" numberOfLines={1}>
                {m.title}
              </Text>
            )}
            {(!!m?.subtitle || items.length > 1) && (
              <Text variant="caption" color="rgba(255,255,255,0.75)" numberOfLines={1}>
                {[m?.subtitle, items.length > 1 ? t('ofCount', { n: current + 1, total: items.length }) : null].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
          <IconButton icon={Download} label={t('save')} onPress={save} bg="rgba(0,0,0,0.45)" />
        </View>
        {notice && (
          <View style={[styles.notice, { bottom: insets.bottom + space.xxl }]} accessibilityLiveRegion="polite">
            {notice.ok ? <CircleCheck size={18} color="#4ade80" /> : <CircleAlert size={18} color="#f87171" />}
            <Text variant="small" weight="semibold" color="#fff" style={styles.flex}>
              {notice.text}
            </Text>
          </View>
        )}
      </OnDark.Provider>
      {current > 0 && (
        <Touchable onPress={() => go(current - 1)} accessibilityRole="button" accessibilityLabel={t('previous')} rippleColor="rgba(255,255,255,0.2)" style={[styles.arrow, styles.arrowLeft]}>
          <ChevronLeft size={26} color="#fff" />
        </Touchable>
      )}
      {current < items.length - 1 && (
        <Touchable onPress={() => go(current + 1)} accessibilityRole="button" accessibilityLabel={t('next')} rippleColor="rgba(255,255,255,0.2)" style={[styles.arrow, styles.arrowRight]}>
          <ChevronRight size={26} color="#fff" />
        </Touchable>
      )}
    </View>
  );
}

function Page({ item, width, active }: { item: ViewerMedia; width: number; active: boolean }) {
  const t = useT('mobile.chat');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.page, { width }]}>
      {failed ? (
        <View style={styles.center}>
          <CircleAlert size={28} color="#fff" />
          <Text color="#fff" align="center">
            {t('openFailed')}
          </Text>
        </View>
      ) : item.kind === 'image' ? (
        <Image source={{ uri: item.uri }} style={styles.fill} resizeMode="contain" onLoadEnd={() => setLoading(false)} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      ) : (
        <Video source={{ uri: item.uri }} style={styles.fill} resizeMode="contain" controls paused={!active} onLoad={() => setLoading(false)} onError={() => setFailed(true)} />
      )}
      {loading && !failed && (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </View>
  );
}

/**
 * A shared document: name, size and Open, which hands it to the phone's own
 * viewer (RN has no in-app viewer for PDFs and Word files).
 */
export function DocumentSheet({ message, onClose }: { message: ChatMessage | null; onClose: () => void }) {
  const t = useT('mobile.chat');
  const toast = useToast();
  const media = message?.media;
  const open = useCallback(() => {
    if (!media) return;
    Linking.openURL(media.url).catch(() => toast.error(t('openFailed')));
  }, [media, toast, t]);
  return (
    <Sheet visible={!!media} onClose={onClose} title={t('document')}>
      {media && (
        <>
          <View style={styles.doc}>
            <View style={styles.docIcon}>
              <FileText size={30} color={colors.primaryText} />
            </View>
            <Text weight="bold" align="center" numberOfLines={3}>
              {media.name}
            </Text>
            <Text variant="small" numeric color={colors.textMuted} align="center">
              {formatBytes(media.size)}
            </Text>
          </View>
          <Button label={t('openDocument')} icon={FileText} onPress={open} block />
          <Text variant="small" color={colors.textMuted} align="center">
            {t('noPreview')}
          </Text>
        </>
      )}
    </Sheet>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    fill: { flex: 1, backgroundColor: '#000' },
    ltr: { direction: 'ltr' },
    page: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
    top: { position: 'absolute', top: 0, start: 0, end: 0, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md },
    arrow: { position: 'absolute', top: '50%', marginTop: -24, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
    arrowLeft: { left: space.md },
    notice: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: 'rgba(20,26,24,0.92)', borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md },
    arrowRight: { right: space.md },
    doc: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
    docIcon: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  }),
);
