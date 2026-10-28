import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { visitsApi } from '../../api/caregiver/api';
import { keys } from '../../api/caregiver/keys';
import type { CaregiverVisitListItem } from '../../api/types';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Segmented, Touchable } from '../../components/ui';
import { useT } from '../../i18n';
import { localDayKey } from '../../i18n/format';
import { useQuery } from '../../lib/query';
import type { CaregiverStack, CaregiverTabs } from '../../navigation/types';
import { brand, colors, radius, space, TOUCH } from '../../theme';
import { VisitRow } from './components/Bits';
import { ACTIVE_STATUSES, dayKey, useNow } from './components/helpers';
import { DateField } from './components/Pickers';

type Props = CompositeScreenProps<BottomTabScreenProps<CaregiverTabs, 'Visits'>, NativeStackScreenProps<CaregiverStack>>;

export function VisitsScreen({ navigation }: Props) {
  const t = useT('caregiverA.visits');
  const now = useNow(60_000);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [onDate, setOnDate] = useState('');

  // Separate windows per tab so neither is cut off by the other's history.
  const upList = useQuery([...keys.visits, 'upcoming'], () => visitsApi.list({ from: localDayKey(Date.now() - 86_400_000), sort: 'asc', limit: 100 }));
  const pastList = useQuery([...keys.visits, 'past'], () => visitsApi.list({ to: localDayKey(Date.now()), sort: 'desc', limit: 50 }), { enabled: tab === 'past' });
  const list = tab === 'upcoming' ? upList : pastList;
  const dated = useQuery([...keys.visits, 'on', onDate], () => visitsApi.list({ date: onDate, limit: 100 }), { enabled: !!onDate });

  const today = localDayKey(now);
  const { upcoming, past } = useMemo(() => {
    const visible = (list.data?.items ?? []).filter(v => v.status !== 'REQUESTED' && v.status !== 'DECLINED');
    const up = visible
      .filter(v => ACTIVE_STATUSES.includes(v.status) || (v.status === 'CONFIRMED' && dayKey(v.scheduledDate) >= today))
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.timeWindowStart.localeCompare(b.timeWindowStart));
    const rest = visible
      .filter(v => !up.includes(v))
      .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate) || b.timeWindowStart.localeCompare(a.timeWindowStart));
    return { upcoming: up, past: rest };
  }, [list.data, today]);

  const datedShown = useMemo(() => (dated.data?.items ?? []).filter(v => v.status !== 'REQUESTED' && v.status !== 'DECLINED'), [dated.data]);
  const data = onDate ? datedShown : tab === 'upcoming' ? upcoming : past;
  const query = onDate ? dated : list;

  const open = useCallback((id: string) => navigation.navigate('CgVisitDetail', { id }), [navigation]);
  const renderItem = useCallback(({ item }: { item: CaregiverVisitListItem }) => <VisitRow visit={item} onPress={open} />, [open]);

  const header = (
    <View style={styles.head}>
      <Text color={colors.textMuted}>{t('description')}</Text>
      {!onDate && (
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: t('upcoming') },
            { value: 'past', label: t('past') },
          ]}
        />
      )}
      <View style={styles.dateRow}>
        <View style={styles.flex}>
          <DateField label={t('onDate')} value={onDate} onChange={setOnDate} />
        </View>
        {!!onDate && (
          <Touchable onPress={() => setOnDate('')} accessibilityRole="button" style={styles.clear}>
            <Text variant="small" weight="bold" color={brand[700]} numberOfLines={1}>
              {t('clearDate')}
            </Text>
          </Touchable>
        )}
      </View>
    </View>
  );

  return (
    <Screen title={t('title')} largeTitle scroll={false}>
      {query.error ? (
        <View style={styles.pad}>
          {header}
          <ErrorState error={query.error} onRetry={query.refetch} />
        </View>
      ) : query.isLoading ? (
        <View style={styles.pad}>
          {header}
          <SkeletonList count={4} height={96} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={v => v.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListHeaderComponentStyle={styles.listHead}
          ListEmptyComponent={<EmptyState title={onDate ? t('noOnDate') : tab === 'upcoming' ? t('noUpcoming') : t('noPast')} />}
          ItemSeparatorComponent={Gap}
          contentContainerStyle={styles.list}
          refreshing={query.isFetching && !query.isLoading}
          onRefresh={query.refetch}
          windowSize={7}
          maxToRenderPerBatch={10}
          removeClippedSubviews
        />
      )}
    </Screen>
  );
}

const Gap = () => <View style={styles.gap} />;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: space.lg, gap: space.lg },
  head: { gap: space.md },
  listHead: { paddingBottom: space.lg },
  list: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xxxl },
  dateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  // Same height as the date field beside it (TOUCH + 4), so tops and bottoms line up.
  clear: { minHeight: TOUCH + 4, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.md, overflow: 'hidden' },
  gap: { height: space.md },
});
