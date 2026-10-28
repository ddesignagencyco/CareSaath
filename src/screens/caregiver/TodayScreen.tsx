import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bookingsApi, moneyApi, notificationsApi, visitsApi } from '../../api/caregiver/api';
import { keys } from '../../api/caregiver/keys';
import type { CaregiverVisitListItem } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { HeroBand } from '../../components/brand';
import { Bell, CalendarDays, Clock, ClipboardList, MapPin, Wallet, type IconType } from '../../components/icons';
import { EmptyState, ErrorState, Screen, Section, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Button, Card, DirChevron, IconButton, IconTile, Touchable, type TileTone, TILE } from '../../components/ui';
import { useT } from '../../i18n';
import { localDayKey, useFmt } from '../../i18n/format';
import { useQuery } from '../../lib/query';
import type { CaregiverStack, CaregiverTabs } from '../../navigation/types';
import { accent, brand, colors, ink, radius, shadow, space, themed, brandFixed, accentFixed } from '../../theme';
import { VisitRow } from './components/Bits';
import { ACTIVE_STATUSES, dayKey, greetingKey, openMaps, useNow, visitStart } from './components/helpers';
import { MapPinned } from './components/icons';
import { Stepper, stepIndex } from './components/VisitFlow';

type Props = CompositeScreenProps<BottomTabScreenProps<CaregiverTabs, 'Today'>, NativeStackScreenProps<CaregiverStack>>;

/** Caregiver home: what's live now, what's next, what needs a reply. */
export function TodayScreen({ navigation }: Props) {
  const t = useT('caregiverA.today');
  const tn = useT('caregiverA.nav');
  const tm = useT('mobileCaregiver.today');
  const f = useFmt();
  const now = useNow(60_000);
  const { me } = useAuth();
  const insets = useSafeAreaInsets();

  // From yesterday onward, soonest first: a long history can't push today's visits off the page.
  const visits = useQuery([...keys.visits, 'upcoming'], () => visitsApi.list({ from: localDayKey(Date.now() - 86_400_000), sort: 'asc', limit: 100 }));
  const requests = useQuery([...keys.bookings, 'list', 'REQUESTED'], () => bookingsApi.list({ status: 'REQUESTED', limit: 20 }));
  const earnings = useQuery(keys.earnings, moneyApi.earnings);
  const unread = useQuery([...keys.notifications, 'unread'], () => notificationsApi.list({ channel: 'PUSH', unread: true, limit: 1 }));

  const today = localDayKey(now);
  const all = visits.data?.items ?? [];
  const active = all.find(v => ACTIVE_STATUSES.includes(v.status));
  const todays = all
    .filter(v => dayKey(v.scheduledDate) === today && v.status !== 'DECLINED' && v.status !== 'CANCELLED')
    .sort((a, b) => a.timeWindowStart.localeCompare(b.timeWindowStart));
  const next = all
    .filter(v => v.status === 'CONFIRMED' && visitStart(v.scheduledDate, v.timeWindowEnd) > now)
    .sort((a, b) => visitStart(a.scheduledDate, a.timeWindowStart) - visitStart(b.scheduledDate, b.timeWindowStart))[0];
  const pending = requests.data?.total ?? 0;
  const firstName = me?.fullName.split(' ')[0];
  const greeting = t(`greeting.${greetingKey(now)}`);

  const open = useCallback((id: string) => navigation.navigate('CgVisitDetail', { id }), [navigation]);
  const refresh = () => {
    visits.refetch();
    requests.refetch();
    earnings.refetch();
  };

  return (
    <Screen
      // Fixed teal strip under the status bar; the band itself scrolls away.
      header={<View style={[styles.statusStrip, { height: insets.top }]} />}
      refreshing={visits.isFetching && !visits.isLoading}
      onRefresh={refresh}>
      <HeroBand overlap={HERO_OVERLAP} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.flex}>
            <Text variant="small" weight="semibold" color={brandFixed[100]}>
              {f.longDay(today)}
            </Text>
            <Text variant="h1" weight="extrabold" color="#fff" accessibilityRole="header" style={styles.greeting}>
              {firstName ? t('greetingName', { greeting, name: firstName }) : greeting}
            </Text>
          </View>
          <IconButton icon={Bell} color="#fff" bg="rgba(255,255,255,0.12)" label={tn('notifications')} badge={unread.data?.total} onPress={() => navigation.navigate('CgNotifications')} />
        </View>
      </HeroBand>

      {/* Summary card over the band: balance full width (the longest value), then two compact counts. */}
      <View style={styles.stats}>
        <Touchable onPress={() => navigation.navigate('Earnings')} accessibilityRole="button" style={styles.balance}>
          <IconTile icon={Wallet} tone="mint" size={44} />
          <View style={styles.flex}>
            <Text variant="small" color={colors.textMuted} numberOfLines={1}>
              {tm('stats.balance')}
            </Text>
            <Text variant="h2" weight="extrabold" color={brand[800]} numberOfLines={1} numeric tabular>
              {earnings.data ? f.money(earnings.data.availableAmount) : '—'}
            </Text>
          </View>
          <DirChevron color={brand[600]} />
        </Touchable>
        <View style={styles.counts}>
          <Count icon={ClipboardList} tone="marigold" value={pending} label={tm('stats.requests')} onPress={() => navigation.navigate('Requests')} />
          <Count icon={CalendarDays} tone="teal" value={todays.length} label={tm('stats.visitsToday')} onPress={() => navigation.navigate('Visits')} />
        </View>
      </View>

      {active && <LiveVisitCard visit={active} onOpen={() => open(active.id)} />}

      {pending > 0 && (
        <Touchable onPress={() => navigation.navigate('Requests')} accessibilityRole="button" style={styles.requests}>
          <IconTile icon={ClipboardList} tone="marigold" size={40} />
          <Text weight="bold" style={styles.flex}>
            {t('requestsWaiting', { count: pending })}
          </Text>
          <Text variant="small" weight="bold" color={brand[700]} numberOfLines={1}>
            {tm('requestsCta')}
          </Text>
          <DirChevron color={brand[600]} />
        </Touchable>
      )}

      <Section title={t('nextVisit')}>
        {visits.error ? (
          <ErrorState error={visits.error} onRetry={visits.refetch} />
        ) : visits.isLoading ? (
          <SkeletonList count={1} height={160} />
        ) : next ? (
          <NextVisit visit={next} onOpen={() => open(next.id)} />
        ) : (
          <Card>
            <EmptyState title={t('noUpcoming')} text={t('noUpcomingHint')} />
          </Card>
        )}
      </Section>

      <Section
        title={t('schedule')}
        action={
          <Touchable onPress={() => navigation.navigate('Visits')} accessibilityRole="button" style={styles.link}>
            <Text variant="small" weight="bold" color={brand[700]} numberOfLines={1}>
              {t('allVisits')}
            </Text>
          </Touchable>
        }>
        {visits.isLoading ? (
          <SkeletonList count={2} height={96} />
        ) : todays.length === 0 ? (
          <Text color={colors.textMuted}>{t('noVisitsToday')}</Text>
        ) : (
          <View style={styles.list}>
            {todays.map(v => (
              <VisitRow key={v.id} visit={v} onPress={open} />
            ))}
          </View>
        )}
      </Section>
    </Screen>
  );
}

const HERO_OVERLAP = 44;

/** Compact count button: icon, number and label on one line; half the card width. */
function Count({ icon, tone, value, label, onPress }: { icon: IconType; tone: TileTone; value: number; label: string; onPress: () => void }) {
  const c = TILE[tone];
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={styles.count}>
      <IconTile icon={icon} tone={tone} size={32} />
      <Text variant="title" weight="extrabold" color={c.fg} numeric tabular>
        {String(value)}
      </Text>
      <Text variant="small" weight="semibold" color={c.fg} numberOfLines={2} style={styles.flex}>
        {label}
      </Text>
    </Touchable>
  );
}

/**
 * The one loud surface in the caregiver app: deep teal with a marigold step
 * track, so an in-progress visit is impossible to miss. One big button takes
 * the caregiver to the next step.
 */
function LiveVisitCard({ visit, onOpen }: { visit: CaregiverVisitListItem; onOpen: () => void }) {
  const tm = useT('mobileCaregiver.today');
  const f = useFmt();
  return (
    <View style={styles.live}>
      <View style={styles.liveHead}>
        <Text variant="small" weight="bold" color={accentFixed[200]} numberOfLines={1} style={styles.flex}>
          {tm(`liveLabel.${visit.status}`)}
        </Text>
        <Text variant="small" color={brandFixed[200]} numberOfLines={1} style={[styles.shrink, styles.ltr]}>
          {f.timeWindow(visit.timeWindowStart, visit.timeWindowEnd)}
        </Text>
      </View>
      <View>
        <Text variant="h2" weight="extrabold" color="#fff" numberOfLines={1}>
          {visit.booking.patient.name}
        </Text>
        <View style={styles.inline}>
          <MapPin size={14} color={brandFixed[200]} />
          <Text variant="small" color={brandFixed[100]} numberOfLines={1} style={styles.flex}>
            {`${visit.booking.address.addressLine}, ${visit.booking.address.city}`}
          </Text>
        </View>
      </View>
      <Stepper current={stepIndex(visit.status)} dark />
      <Button label={tm(`nextStep.${visit.status}`)} variant="live" size="lg" block onPress={onOpen} />
    </View>
  );
}

function NextVisit({ visit, onOpen }: { visit: CaregiverVisitListItem; onOpen: () => void }) {
  const t = useT('caregiverA.today');
  const f = useFmt();
  return (
    <Card style={styles.next}>
      <View style={styles.inline}>
        <Clock size={16} color={brand[600]} />
        <Text weight="bold" color={brand[800]} numberOfLines={1} style={styles.flex}>
          {`${f.relativeDay(visit.scheduledDate)} · `}
          <Text weight="bold" color={brand[800]} style={styles.ltr}>
            {f.timeWindow(visit.timeWindowStart, visit.timeWindowEnd)}
          </Text>
        </Text>
      </View>
      <Text variant="title" weight="extrabold" numberOfLines={1}>
        {visit.booking.patient.name}
      </Text>
      <View style={styles.inline}>
        <MapPin size={14} color={ink[400]} />
        <Text variant="small" color={colors.textMuted} numberOfLines={2} style={styles.flex}>
          {`${visit.booking.address.addressLine}, ${visit.booking.address.city}`}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button label={t('directions')} icon={MapPinned} variant="secondary" style={styles.flex} onPress={() => openMaps(visit.booking.address)} />
        <Button label={t('openVisit')} style={styles.flex} onPress={onOpen} />
      </View>
    </Card>
  );
}

const styles = themed(() => StyleSheet.create({
  statValue: { alignSelf: 'stretch' },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  ltr: { writingDirection: 'ltr' },
  // Same token as Home's strip, so the seam with the band gradient matches.
  statusStrip: { backgroundColor: brandFixed[800] },
  hero: { marginHorizontal: -space.lg, marginTop: -space.lg, paddingTop: space.lg },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  greeting: { letterSpacing: -0.5 },
  stats: {
    marginTop: -(HERO_OVERLAP + space.lg),
    marginHorizontal: space.xs,
    padding: space.sm,
    gap: space.sm,
    borderRadius: radius.lg + 4,
    backgroundColor: colors.surface,
    ...shadow.pop,
  },
  balance: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.lg },
  counts: { flexDirection: 'row', gap: space.sm },
  count: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: radius.md, minHeight: 56, backgroundColor: colors.surfaceMuted },
  list: { gap: space.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  live: { backgroundColor: brand[900], borderRadius: radius.xl, padding: space.xl, gap: space.lg, ...shadow.pop },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  requests: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    minHeight: 64,
    borderRadius: radius.lg,
    backgroundColor: accent[50],
    borderWidth: 1,
    borderColor: accent[100],
    overflow: 'hidden',
  },
  next: { gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs, borderRadius: radius.sm, overflow: 'hidden' },
}));
