import React from 'react';
import { meApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { useT } from '../../i18n';
import { useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { colors } from '../../theme';
import { DisputeItem, useMyDisputes } from './components/panels';

/** FR-A7 (customer side): disputes raised by or about this account. */
export function DisputesScreen({ navigation }: CustomerScreen<'Disputes'>) {
  const t = useT('customerB.disputes');
  const me = useQuery(keys.me, () => meApi.get());
  const list = useMyDisputes();
  return (
    <Screen title={t('title')} back refreshing={list.isFetching && !list.isLoading} onRefresh={list.refetch}>
      <Text color={colors.textMuted}>{t('description')}</Text>
      {list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : !list.data ? (
        <SkeletonList count={2} height={120} />
      ) : list.data.length === 0 ? (
        <EmptyState title={t('emptyTitle')} text={t('emptyHint')} />
      ) : (
        list.data.map(d => <DisputeItem key={d.id} d={d} userId={me.data?.id} onViewVisit={visitId => navigation.navigate('VisitDetail', { id: visitId })} />)
      )}
    </Screen>
  );
}
