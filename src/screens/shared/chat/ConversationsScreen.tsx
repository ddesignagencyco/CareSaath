import React, { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { chatApi } from '../../../api/chat/api';
import { chatKeys } from '../../../api/chat/keys';
import type { ChatConversation } from '../../../api/chat/types';
import { CheckCheck, CloudUpload, MessagesSquare } from '../../../components/icons';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../../components/screen';
import { Text } from '../../../components/Text';
import { Avatar, CountBadge, Divider, Touchable } from '../../../components/ui';
import { localDayKey, useFmt } from '../../../i18n/format';
import { useT } from '../../../i18n';
import { useQuery } from '../../../lib/query';
import { usePendingUploadCount } from '../../../lib/uploads';
import { accent, colors, space, themed } from '../../../theme';
import { clock, useChatNav, useChatScope, usePeerRole, usePreview } from './common';

/** Everyone you can message, latest conversation first. */
export function ConversationsScreen() {
  const t = useT('mobile.chat');
  const scope = useChatScope();
  const nav = useChatNav();
  const api = useMemo(() => chatApi(scope), [scope]);
  const list = useQuery(chatKeys.conversations(scope), () => api.conversations());
  const pending = usePendingUploadCount(scope);

  const renderItem = useCallback(
    ({ item }: { item: ChatConversation }) => <Row c={item} pending={pending[item.id] ?? 0} onPress={() => nav.navigate('Chat', { id: item.id, name: item.peer.name })} />,
    [nav, pending],
  );

  return (
    <Screen title={t('title')} largeTitle scroll={false}>
      {list.isLoading ? (
        <View style={styles.pad}>
          <SkeletonList count={4} height={64} />
        </View>
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={c => c.id}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          refreshing={list.isFetching && !list.isLoading}
          onRefresh={list.refetch}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon={MessagesSquare} title={t('empty')} text={scope === 'customer' ? t('emptyHintCustomer') : t('emptyHintCaregiver')} />}
        />
      )}
    </Screen>
  );
}

const Separator = () => <Divider inset={space.lg + 52 + space.md} />;

function Row({ c, pending, onPress }: { c: ChatConversation; pending: number; onPress: () => void }) {
  const t = useT('mobile.chat');
  const tl = useT('labels.time');
  const f = useFmt();
  const preview = usePreview();
  const role = usePeerRole();
  const last = c.lastMessage;
  const when = last
    ? localDayKey(new Date(last.createdAt).getTime()) === localDayKey(Date.now())
      ? clock(last.createdAt)
      : localDayKey(new Date(last.createdAt).getTime()) === localDayKey(Date.now() - 86_400_000)
        ? tl('yesterday')
        : f.date(last.createdAt)
    : '';
  const unread = c.unread > 0;

  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={unread ? `${c.peer.name}, ${t('newMessages', { count: c.unread })}` : c.peer.name} pressScale={false} style={styles.row}>
      <Avatar name={c.peer.name} uri={c.peer.photoUrl} size={52} />
      <View style={styles.flex}>
        <View style={styles.line}>
          <Text weight="bold" numberOfLines={1} style={styles.flex}>
            {c.peer.name}
          </Text>
          <Text variant="caption" weight={unread ? 'bold' : 'regular'} color={unread ? colors.primaryText : colors.textSubtle} numberOfLines={1}>
            {when}
          </Text>
        </View>
        <View style={styles.line}>
          {pending > 0 ? (
            <>
              <CloudUpload size={16} color={accent[600]} />
              <Text variant="small" weight="semibold" color={accent[700]} numberOfLines={1} style={styles.flex}>
                {t('uploadsPending', { count: pending })}
              </Text>
            </>
          ) : (
            <>
              {last?.sender === 'me' && !last.deleted && <CheckCheck size={16} color={last.readByThem ? '#38bdf8' : colors.textSubtle} />}
              <Text variant="small" color={unread ? colors.text : colors.textMuted} weight={unread ? 'semibold' : 'regular'} numberOfLines={1} style={styles.flex}>
                {last ? (last.sender === 'me' && !last.deleted ? `${t('you')}: ${preview(last)}` : preview(last)) : role(c.peer.role)}
              </Text>
            </>
          )}
          {unread && <CountBadge count={c.unread} />}
        </View>
      </View>
    </Touchable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    pad: { padding: space.lg },
    list: { flexGrow: 1, paddingVertical: space.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.bg },
    line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  }),
);
