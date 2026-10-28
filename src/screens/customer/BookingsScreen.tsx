import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { bookingsApi, patientsApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import type { CustomerBookingListItem } from '../../api/types';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Button, Segmented } from '../../components/ui';
import { useT } from '../../i18n';
import { useQuery } from '../../lib/query';
import type { CustomerStack, CustomerTabs } from '../../navigation/types';
import { brand, space } from '../../theme';
import { BookingCard, useCaregiverMap } from './components/bits';
import { usePayments } from './components/panels';

type Props = CompositeScreenProps<BottomTabScreenProps<CustomerTabs, 'Bookings'>, NativeStackScreenProps<CustomerStack>>;
type Tab = 'active' | 'waiting' | 'past';

const finished = (b: CustomerBookingListItem) => b.visits.length > 0 && b.visits.every(v => ['COMPLETED', 'CANCELLED', 'DECLINED'].includes(v.status));

/** FR-C9: every booking, split into active / waiting for a reply / past. */
export function BookingsScreen({ navigation }: Props) {
  const t = useT('customerB.bookings');
  const [tab, setTab] = useState<Tab>('active');
  const list = useQuery([...keys.bookings, 'all'], () => bookingsApi.list({ limit: 100 }));
  const patients = useQuery(keys.patients, () => patientsApi.list());
  const payments = usePayments();
  const all = useMemo(() => list.data?.items ?? [], [list.data]);
  const caregivers = useCaregiverMap(all.map(b => b.caregiverId));

  // A booking has payment due if a done visit has no settled payment.
  const paid = new Set((payments.data?.items ?? []).filter(p => p.status === 'PAID').map(p => p.visitId));
  const paymentDue = (b: CustomerBookingListItem) => b.visits.some(v => (v.status === 'COMPLETED' || v.status === 'CHECKED_OUT') && !paid.has(v.id));

  const groups: Record<Tab, CustomerBookingListItem[]> = {
    active: all.filter(b => b.status === 'CONFIRMED' && !finished(b)),
    waiting: all.filter(b => b.status === 'REQUESTED'),
    past: all.filter(b => b.status === 'DECLINED' || b.status === 'CANCELLED' || b.status === 'COMPLETED' || (b.status === 'CONFIRMED' && finished(b))),
  };
  const shown = groups[tab];

  const open = useCallback((id: string) => navigation.navigate('BookingDetail', { id }), [navigation]);
  const renderItem = ({ item }: { item: CustomerBookingListItem }) => (
    <BookingCard booking={item} caregiver={caregivers[item.caregiverId]} patient={patients.data?.find(p => p.id === item.patientId)} paymentDue={paymentDue(item)} onPress={open} />
  );

  return (
    <Screen title={t('title')} largeTitle scroll={false}>
      <View style={styles.tabs}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            // No counts here: with them the Urdu labels no longer fit three segments.
            { value: 'active', label: t('tabActive') },
            { value: 'waiting', label: t('tabWaiting') },
            { value: 'past', label: t('tabPast') },
          ]}
        />
      </View>
      {list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={b => b.id}
          renderItem={renderItem}
          extraData={[caregivers, payments.data, patients.data]}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={Separator}
          refreshControl={<RefreshControl refreshing={list.isFetching && !list.isLoading} onRefresh={list.refetch} colors={[brand[600]]} />}
          ListEmptyComponent={
            list.isLoading ? (
              <SkeletonList count={3} height={150} />
            ) : (
              <EmptyState
                title={tab === 'waiting' ? t('emptyWaiting') : tab === 'active' ? t('emptyActive') : t('emptyPast')}
                text={tab === 'past' ? undefined : t('emptyHint')}
                action={tab === 'past' ? undefined : <Button label={t('findCare')} onPress={() => navigation.navigate('FindCare')} />}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

const Separator = () => <View style={styles.sep} />;

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md },
  list: { padding: space.lg, paddingTop: 0, paddingBottom: space.xxxl },
  sep: { height: space.md },
});
