import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bookingsApi, meApi, notificationsApi, patientsApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import type { Specialty } from '../../api/types';
import { HeroBand } from '../../components/brand';
import { Activity, Bandage, Bell, Search, Stethoscope, type IconType } from '../../components/icons';
import { EmptyState, ErrorState, Screen, Section, Skeleton } from '../../components/screen';
import { Text } from '../../components/Text';
import { Avatar, Badge, Button, Card, DateBlock, Divider, DirChevron, IconButton, IconTile, Touchable, type TileTone } from '../../components/ui';
import { useT } from '../../i18n';
import { useFmt, useLabels } from '../../i18n/format';
import { useQuery } from '../../lib/query';
import type { CustomerStack, CustomerTabs } from '../../navigation/types';
import { brand, colors, ink, radius, shadow, space, themed, brandFixed } from '../../theme';
import { ACTIVE_VISIT, VISIT_TONE, dayKey, todayKey, useCaregiverMap, useDayLabel, visitStart } from './components/bits';
import { HeartHandshake, UserPlus } from './components/icons';
import { LiveVisitCard } from './components/tracker';

type Props = CompositeScreenProps<BottomTabScreenProps<CustomerTabs, 'Home'>, NativeStackScreenProps<CustomerStack>>;

const SERVICES: { specialty: Specialty; icon: IconType; tone: TileTone }[] = [
  { specialty: 'NURSING', icon: Stethoscope, tone: 'teal' },
  { specialty: 'PHYSIOTHERAPY', icon: Activity, tone: 'mint' },
  { specialty: 'POST_SURGERY_CARE', icon: Bandage, tone: 'marigold' },
  { specialty: 'ELDERLY_CARE', icon: HeartHandshake, tone: 'sand' },
];

/** Space the search card floats over the bottom of the hero band. */
const OVERLAP = 32;

function period(now: number) {
  const h = new Date(now).getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

/** Unread in-app (PUSH) notifications, for the bell. */
export function useUnreadCount() {
  const q = useQuery([...keys.notifications, 'list'], () => notificationsApi.list({ channel: 'PUSH', limit: 50 }));
  return (q.data?.items ?? []).filter(n => n.channel === 'PUSH' && !n.readAt).length;
}

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const t = useT('customerA.home');
  const tm = useT('mobileCustomer.home');
  const tn = useT('common.nav');
  const f = useFmt();
  const L = useLabels();
  const dayLabel = useDayLabel();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const me = useQuery(keys.me, () => meApi.get());
  const bookings = useQuery([...keys.bookings, 'all'], () => bookingsApi.list({ limit: 50 }));
  const patients = useQuery(keys.patients, () => patientsApi.list());
  const unread = useUnreadCount();
  const all = bookings.data?.items ?? [];
  const caregivers = useCaregiverMap(all.map(b => b.caregiverId));
  const patientName = (id: string) => patients.data?.find(p => p.id === id)?.name ?? '';

  const visits = all.filter(b => b.status === 'CONFIRMED' || b.status === 'REQUESTED').flatMap(b => b.visits.map(v => ({ v, b })));
  const active = visits.find(({ v }) => ACTIVE_VISIT.includes(v.status));
  const today = todayKey();
  const upcoming = visits
    .filter(({ v }) => (v.status === 'CONFIRMED' || v.status === 'REQUESTED') && dayKey(v.scheduledDate) >= today && visitStart(v.scheduledDate, v.timeWindowEnd) > now)
    .sort((a, b) => visitStart(a.v.scheduledDate, a.v.timeWindowStart) - visitStart(b.v.scheduledDate, b.v.timeWindowStart))
    .slice(0, 4);
  const first = me.data?.fullName.split(' ')[0];
  const noPatients = patients.data && patients.data.length === 0;

  const refresh = () => {
    bookings.refetch();
    patients.refetch();
  };

  return (
    <Screen
      refreshing={bookings.isFetching && !bookings.isLoading}
      onRefresh={refresh}
      contentStyle={styles.content}
      // Fixed teal strip behind the status bar: the hero scrolls away but the
      // light status-bar icons must stay readable.
      header={<View style={[styles.statusStrip, { height: insets.top }]} />}>
      <HeroBand overlap={OVERLAP} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.flex}>
            <Text variant="h2" weight="extrabold" color="#fff" accessibilityRole="header">
              {first ? t('greetingNamed', { period: period(now), name: first }) : t('greeting', { period: period(now) })}
            </Text>
            <Text color={brandFixed[100]}>{t('subtitle')}</Text>
          </View>
          <IconButton
            icon={Bell}
            color="#fff"
            bg="rgba(255,255,255,0.12)"
            label={unread ? tn('notificationsNew', { count: unread }) : tn('notifications')}
            badge={unread}
            onPress={() => navigation.navigate('Notifications')}
          />
        </View>
      </HeroBand>

      <View style={styles.body}>
        {/* Floating search card: the main job of this screen, one tap away. */}
        <Touchable onPress={() => navigation.navigate('FindCare')} accessibilityRole="search" accessibilityLabel={tm('searchTitle')} style={styles.search}>
          <View style={styles.searchIcon}>
            <Search size={22} color="#fff" strokeWidth={2.4} />
          </View>
          <View style={styles.flex}>
            <Text weight="bold" numberOfLines={1}>
              {tm('searchTitle')}
            </Text>
            <Text variant="small" color={colors.textMuted} numberOfLines={1}>
              {tm('searchHint')}
            </Text>
          </View>
          <DirChevron color={brand[600]} />
        </Touchable>

        {active && (
          <LiveVisitCard
            status={active.v.status}
            caregiver={caregivers[active.b.caregiverId]}
            patientName={patientName(active.b.patientId)}
            onPress={() => navigation.navigate('VisitDetail', { id: active.v.id })}
          />
        )}

        {noPatients && (
          <Card style={styles.firstTime}>
            <IconTile icon={UserPlus} tone="teal" size={48} />
            <Text variant="lead" weight="bold">
              {t('firstTime.title')}
            </Text>
            <Text variant="small" color={ink[600]}>
              {t('firstTime.text')}
            </Text>
            <Button label={t('firstTime.cta')} onPress={() => navigation.navigate('PatientForm')} style={styles.start} />
          </Card>
        )}

        <Section title={tm('servicesTitle')}>
          <View style={styles.grid}>
            {SERVICES.map(({ specialty, icon, tone }) => (
              <Touchable
                key={specialty}
                onPress={() => navigation.navigate('FindCare', { specialty })}
                accessibilityRole="button"
                accessibilityLabel={L.specialty(specialty)}
                style={styles.service}>
                <IconTile icon={icon} tone={tone} size={48} />
                <View style={styles.serviceText}>
                  <Text weight="bold">{L.specialty(specialty)}</Text>
                  <Text variant="caption" color={colors.textMuted}>
                    {t(`services.${specialty}`)}
                  </Text>
                </View>
              </Touchable>
            ))}
          </View>
        </Section>

        <Section
          title={t('upcomingTitle')}
          action={
            upcoming.length > 0 ? (
              <Touchable onPress={() => navigation.navigate('Bookings')} accessibilityRole="button" style={styles.link}>
                <Text variant="small" weight="bold" color={brand[700]} numberOfLines={1}>
                  {t('allBookings')}
                </Text>
              </Touchable>
            ) : undefined
          }>
          {bookings.error && !bookings.data ? (
            <ErrorState error={bookings.error} onRetry={bookings.refetch} />
          ) : bookings.isLoading ? (
            <Skeleton height={160} />
          ) : upcoming.length === 0 ? (
            <Card>
              <EmptyState
                title={tm('upcomingEmpty')}
                text={tm('upcomingEmptyText')}
                action={<Button label={t('findCaregiver')} onPress={() => navigation.navigate('FindCare')} />}
              />
            </Card>
          ) : (
            <Card padded={false}>
              {upcoming.map(({ v, b }, i) => {
                const cg = caregivers[b.caregiverId];
                const d = dayLabel(v.scheduledDate);
                return (
                  <View key={v.id}>
                    {i > 0 && <Divider inset={space.lg} />}
                    <Touchable onPress={() => navigation.navigate('VisitDetail', { id: v.id })} accessibilityRole="button" pressScale={false} style={styles.visitRow}>
                      <DateBlock day={d.day} label={d.label} highlight={d.isToday} />
                      <View style={styles.flex}>
                        <View style={styles.who}>
                          <Avatar name={cg?.user.fullName ?? '?'} uri={cg?.photoUrl} size={28} />
                          <Text weight="bold" style={styles.flex} numberOfLines={1}>
                            {cg?.user.fullName ?? t('caregiverFallback')}
                          </Text>
                        </View>
                        <Text variant="small" color={colors.textMuted} numberOfLines={1}>
                          {f.timeWindow(v.timeWindowStart, v.timeWindowEnd)}
                        </Text>
                        <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
                          {t('forPatient', { specialty: L.specialty(b.serviceType), patient: patientName(b.patientId) })}
                        </Text>
                        <View style={styles.badge}>
                          <Badge tone={VISIT_TONE[v.status]} label={L.visitCustomer(v.status)} />
                        </View>
                      </View>
                      <DirChevron />
                    </Touchable>
                  </View>
                );
              })}
            </Card>
          )}
        </Section>
      </View>
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  // The hero is edge-to-edge, so the scroll body handles its own padding.
  content: { padding: 0, gap: 0 },
  statusStrip: { backgroundColor: brandFixed[800] },
  hero: { paddingTop: space.lg },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  body: { paddingHorizontal: space.lg, gap: space.xl, marginTop: -OVERLAP },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    paddingEnd: space.lg,
    minHeight: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow.pop,
  },
  searchIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: brand[700], alignItems: 'center', justifyContent: 'center' },
  firstTime: { gap: space.sm, backgroundColor: brand[50], borderColor: brand[100] },
  start: { alignSelf: 'flex-start', marginTop: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  service: {
    flexBasis: '46%',
    flexGrow: 1,
    gap: space.md,
    padding: space.lg,
    minHeight: 148,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: ink[100],
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  serviceText: { gap: 2 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm, borderRadius: radius.sm },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.lg },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  badge: { marginTop: 6, alignItems: 'flex-start' },
}));
