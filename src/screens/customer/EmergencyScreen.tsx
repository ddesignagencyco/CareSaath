import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { addressesApi, bookingsApi, caregiversApi, patientsApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import type { Address, NearbyCaregiver, PatientProfile } from '../../api/types';
import { CircleUser, MapPin, Navigation, Siren } from '../../components/icons';
import { Sheet } from '../../components/overlay';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Avatar, Button, Card, Divider, ListRow } from '../../components/ui';
import { useT } from '../../i18n';
import { formatMoney, useLabels } from '../../i18n/format';
import { useAction, useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { brand, colors, feedback, ink, radius, space, themed } from '../../theme';
import { Banner, Choice, IconLine, Rating, todayKey, VerifiedTag } from './components/bits';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** FR-C4: "Need care now" — nearest caregivers who are available right now, for an ASAP visit. */
export function EmergencyScreen({ navigation }: CustomerScreen<'Emergency'>) {
  const t = useT('mobileCustomer.emergency');
  const L = useLabels();

  const addresses = useQuery(keys.addresses, addressesApi.list);
  const patients = useQuery(keys.patients, patientsApi.list);

  const [addressId, setAddressId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [pick, setPick] = useState<'address' | 'patient' | null>(null);

  const address = useMemo<Address | undefined>(
    () => addresses.data?.find(a => a.id === addressId) ?? addresses.data?.[0],
    [addresses.data, addressId],
  );
  const patient = useMemo<PatientProfile | undefined>(
    () => patients.data?.find(p => p.id === patientId) ?? patients.data?.[0],
    [patients.data, patientId],
  );

  const lat = address ? Number(address.latitude) : undefined;
  const lng = address ? Number(address.longitude) : undefined;

  const nearby = useQuery(
    [...keys.caregivers, 'nearby', lat ?? 0, lng ?? 0],
    () => caregiversApi.nearbyNow(lat!, lng!),
    { enabled: lat !== undefined && lng !== undefined },
  );
  const list = nearby.data?.items ?? [];

  const book = useAction(
    (caregiverId: string) => {
      const now = new Date();
      let end = new Date(now.getTime() + 2 * 3600_000);
      if (end.getDate() !== now.getDate()) end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
      return bookingsApi.create({
        patientId: patient!.id,
        caregiverId,
        addressId: address!.id,
        type: 'SINGLE',
        isImmediate: true,
        startDate: todayKey(),
        endDate: todayKey(),
        timeWindowStart: hhmm(now),
        timeWindowEnd: hhmm(end),
      });
    },
    {
      success: t('booked'),
      onSuccess: booking => navigation.replace('BookingDetail', { id: booking.id }),
    },
  );

  // Needs an address (for the location + the booking) and a patient.
  if (addresses.isLoading || patients.isLoading) {
    return (
      <Screen title={t('title')} back>
        <SkeletonList count={3} height={96} />
      </Screen>
    );
  }
  if (!addresses.data?.length) {
    return (
      <Screen title={t('title')} back>
        <EmptyState icon={MapPin} title={t('noAddressTitle')} text={t('noAddress')} />
        <Button label={t('addAddress')} onPress={() => navigation.navigate('AddressForm')} block />
      </Screen>
    );
  }
  if (!patients.data?.length) {
    return (
      <Screen title={t('title')} back>
        <EmptyState icon={CircleUser} title={t('noPatientTitle')} text={t('noPatient')} />
        <Button label={t('addPatient')} onPress={() => navigation.navigate('PatientForm')} block />
      </Screen>
    );
  }

  return (
    <Screen title={t('title')} back scroll={false}>
      <FlatList
        data={list}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        refreshing={nearby.isFetching && !nearby.isLoading}
        onRefresh={nearby.refetch}
        ListHeaderComponent={
          <View style={styles.header}>
            <Banner tone="danger" icon={Siren}>
              {t('disclaimer')}
            </Banner>
            {/* Who + where, each tappable to change. */}
            <Card padded={false}>
              <ListRow icon={CircleUser} title={t('forPatient')} subtitle={patient?.name} onPress={() => setPick('patient')} />
              <Divider inset={space.lg} />
              <ListRow icon={MapPin} title={t('at')} subtitle={address?.label ?? address?.city} onPress={() => setPick('address')} />
            </Card>
            <Text variant="small" weight="semibold" color={ink[700]} style={styles.listTitle}>
              {t('nearbyTitle')}
            </Text>
          </View>
        }
        renderItem={({ item }) => <NearbyCard c={item} onBook={() => book.run(item.id)} booking={book.isPending} />}
        ListEmptyComponent={
          nearby.isLoading ? (
            <SkeletonList count={3} height={120} />
          ) : nearby.error ? (
            <ErrorState error={nearby.error} onRetry={nearby.refetch} />
          ) : (
            <EmptyState icon={Navigation} title={t('noneTitle')} text={t('none')} />
          )
        }
      />

      {/* Patient / address pickers. */}
      <Sheet visible={pick === 'patient'} onClose={() => setPick(null)} title={t('choosePatient')}>
        <View style={styles.choices}>
          {patients.data.map(p => (
            <Choice key={p.id} selected={p.id === patient?.id} onPress={() => { setPatientId(p.id); setPick(null); }} label={p.name}>
              <Text weight="semibold">{p.name}</Text>
            </Choice>
          ))}
        </View>
      </Sheet>
      <Sheet visible={pick === 'address'} onClose={() => setPick(null)} title={t('chooseAddress')}>
        <View style={styles.choices}>
          {addresses.data.map(a => (
            <Choice key={a.id} selected={a.id === address?.id} onPress={() => { setAddressId(a.id); setPick(null); }} label={a.label ?? a.city}>
              <Text weight="semibold">{a.label ?? a.city}</Text>
              <Text variant="small" color={colors.textMuted} numberOfLines={1}>
                {a.addressLine}
              </Text>
            </Choice>
          ))}
        </View>
      </Sheet>
    </Screen>
  );

  function NearbyCard({ c, onBook, booking }: { c: NearbyCaregiver; onBook: () => void; booking: boolean }) {
    const km = (c.distanceMeters / 1000).toFixed(c.distanceMeters < 10_000 ? 1 : 0);
    return (
      <Card>
        <View style={styles.cardTop}>
          <Avatar name={c.user.fullName} uri={c.photoUrl} size={56} />
          <View style={styles.flex}>
            <Text variant="lead" weight="bold" numberOfLines={1}>
              {c.user.fullName}
            </Text>
            <Text variant="small" weight="semibold" color={brand[700]} numberOfLines={1}>
              {L.specialty(c.specialty)}
            </Text>
            <Rating average={c.ratingAverage} count={c.ratingCount} />
          </View>
          <View style={styles.liveDot}>
            <Text variant="caption" weight="bold" color={feedback.success700}>
              {t('live')}
            </Text>
          </View>
        </View>
        <View style={styles.meta}>
          <IconLine icon={Navigation} text={t('away', { km })} color={ink[700]} />
          <IconLine icon={MapPin} text={t('eta', { n: c.etaMinutes })} color={ink[700]} />
          <VerifiedTag />
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.flex}>
            <Text variant="title" weight="extrabold" color={brand[800]} tabular numberOfLines={1}>
              {formatMoney(c.ratePerVisit)}
            </Text>
            <Text variant="caption" color={colors.textMuted}>
              {t('perVisit')}
            </Text>
          </View>
          <Button label={t('bookNow')} onPress={onBook} loading={booking} disabled={booking} />
        </View>
      </Card>
    );
  }
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    list: { padding: space.lg, gap: space.md },
    header: { gap: space.md },
    listTitle: { marginTop: space.sm },
    choices: { gap: space.sm },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
    liveDot: { backgroundColor: feedback.success50, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
    meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: 6, marginTop: space.md },
    cardBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginTop: space.md,
      paddingTop: space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: ink[200],
    },
  }),
);
