import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { chatApi } from '../../../api/chat/api';
import { chatKeys } from '../../../api/chat/keys';
import type { ChatMessage } from '../../../api/chat/types';
import { FileText, ImageIcon, Play } from '../../../components/icons';
import { EmptyState, ErrorState, Screen, Section, SkeletonList } from '../../../components/screen';
import { Text } from '../../../components/Text';
import { Card, Divider, Touchable } from '../../../components/ui';
import { formatBytes, useFmt } from '../../../i18n/format';
import { useT } from '../../../i18n';
import { useQuery } from '../../../lib/query';
import type { ChatRoutes } from '../../../navigation/types';
import { colors, inkFixed, radius, space, themed } from '../../../theme';
import { useChatScope } from './common';
import { DocumentSheet, MediaViewer, toViewerMedia } from './MediaViewer';

const COLS = 3;
const GAP = 4;

/** Everything shared in one chat: a photo/video grid, then documents. */
export function ChatMediaScreen({ route }: NativeStackScreenProps<ChatRoutes, 'ChatMedia'>) {
  const { id, name } = route.params;
  const t = useT('mobile.chat');
  const f = useFmt();
  const scope = useChatScope();
  const { width } = useWindowDimensions();
  const api = useMemo(() => chatApi(scope), [scope]);
  const msgs = useQuery(chatKeys.messages(scope, id), () => api.messages(id));
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const [doc, setDoc] = useState<ChatMessage | null>(null);

  const media = useMemo(() => toViewerMedia(msgs.data ?? [], m => (m.sender === 'me' ? t('you') : name), f.dateTime), [msgs.data, t, name, f]);
  const docs = useMemo(() => (msgs.data ?? []).filter(m => m.type === 'file' && m.media && !m.deleted), [msgs.data]);
  const tile = Math.floor((width - space.lg * 2 - GAP * (COLS - 1)) / COLS);

  return (
    <Screen title={t('mediaTitle')} subtitle={name} back>
      {msgs.isLoading ? (
        <SkeletonList count={3} height={tile} />
      ) : msgs.error && !msgs.data ? (
        <ErrorState error={msgs.error} onRetry={msgs.refetch} />
      ) : media.length === 0 && docs.length === 0 ? (
        <EmptyState icon={ImageIcon} title={t('mediaTitle')} text={t('noMedia')} />
      ) : (
        <>
          {media.length > 0 && (
            <Section title={t('mediaSection')}>
              <View style={styles.grid}>
                {media.map((m, i) => (
                  <Touchable key={m.id} onPress={() => setViewerAt(i)} accessibilityRole="imagebutton" accessibilityLabel={m.kind === 'video' ? t('playVideo') : t('photo')} pressScale={false} style={[styles.tile, { width: tile, height: tile }]}>
                    {m.kind === 'image' ? (
                      <Image source={{ uri: m.uri }} style={styles.fill} accessibilityIgnoresInvertColors />
                    ) : (
                      <View style={[styles.fill, styles.video]}>
                        <Play size={26} color="#fff" fill="#fff" />
                      </View>
                    )}
                  </Touchable>
                ))}
              </View>
            </Section>
          )}
          {docs.length > 0 && (
            <Section title={t('documentsSection')}>
              <Card padded={false}>
                {docs.map((d, i) => (
                  <View key={d.id}>
                    {i > 0 && <Divider inset={space.lg + 44 + space.md} />}
                    <Touchable onPress={() => setDoc(d)} accessibilityRole="button" accessibilityLabel={d.media!.name} style={styles.doc}>
                      <View style={styles.docIcon}>
                        <FileText size={22} color={colors.primaryText} />
                      </View>
                      <View style={styles.flex}>
                        <Text weight="semibold" numberOfLines={1}>
                          {d.media!.name}
                        </Text>
                        <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
                          {`${formatBytes(d.media!.size)} · ${f.date(d.createdAt)}`}
                        </Text>
                      </View>
                    </Touchable>
                  </View>
                ))}
              </Card>
            </Section>
          )}
        </>
      )}
      <MediaViewer items={viewerAt === null ? null : media} index={viewerAt ?? 0} onClose={() => setViewerAt(null)} />
      <DocumentSheet message={doc} onClose={() => setDoc(null)} />
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    fill: { width: '100%', height: '100%' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    tile: { borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
    video: { backgroundColor: inkFixed[900], alignItems: 'center', justifyContent: 'center' },
    doc: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
    docIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  }),
);
