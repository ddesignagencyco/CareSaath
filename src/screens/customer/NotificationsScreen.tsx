import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationsApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import type { AppNotification, IncidentStatus } from '../../api/types';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Bell, CalendarClock, CircleCheck, CircleX, HeartPulse, MapPin, Navigation, NotebookPen, Scale, ShieldCheck, Siren, Wallet, type IconType } from '../../components/icons';
import { IconTile, Touchable, type TileTone } from '../../components/ui';
import { useT } from '../../i18n';
import { formatMoney, localDayKey, useFmt, useLabels } from '../../i18n/format';
import { invalidate, useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { brand, colors, ink, radius, space, themed } from '../../theme';

type Target = { screen: 'VisitDetail' | 'BookingDetail'; id: string } | { screen: 'Payments' } | null;
interface View_ {
  title: string;
  body: string;
  target: Target;
  icon: IconType;
  tone: TileTone;
}
const INCIDENT_STATUSES: readonly string[] = ['OPEN', 'IN_REVIEW', 'RESOLVED'];

/** Notification event -> title/body/destination (web: features/customer/lib/labels.ts useDescribe). */
function useDescribe() {
  const t = useT('customerA.notifications.events');
  const tm = useT('mobileCustomer.notifications.events');
  const L = useLabels();
  return useCallback(
    (n: AppNotification): View_ => {
      const p = n.payload;
      const visit: Target = typeof p.visitId === 'string' ? { screen: 'VisitDetail', id: p.visitId } : null;
      const booking: Target = typeof p.bookingId === 'string' ? { screen: 'BookingDetail', id: p.bookingId } : null;
      switch (n.event) {
        case 'booking.confirmed':
          return { title: t('bookingConfirmed.title'), body: t('bookingConfirmed.body'), target: booking, icon: CircleCheck, tone: 'mint' };
        case 'booking.declined':
          return { title: t('bookingDeclined.title'), body: t('bookingDeclined.body'), target: booking, icon: CircleX, tone: 'ink' };
        case 'visit.en_route':
          return { title: t('enRoute.title'), body: t('enRoute.body'), target: visit, icon: Navigation, tone: 'marigold' };
        case 'visit.checked_in':
          return { title: t('checkedIn.title'), body: t('checkedIn.body'), target: visit, icon: MapPin, tone: 'teal' };
        case 'visit.in_progress':
          return { title: t('inProgress.title'), body: '', target: visit, icon: HeartPulse, tone: 'teal' };
        case 'visit.checked_out':
          return { title: t('checkedOut.title'), body: t('checkedOut.body'), target: visit, icon: CircleCheck, tone: 'teal' };
        case 'visit.completed':
          return { title: t('completed.title'), body: t('completed.body'), target: visit, icon: NotebookPen, tone: 'mint' };
        case 'visit.rescheduled':
          return { title: t('rescheduled.title'), body: '', target: visit, icon: CalendarClock, tone: 'sand' };
        case 'payment.paid':
          return { title: t('paymentPaid.title'), body: typeof p.amount === 'number' ? t('paymentPaid.body', { amount: formatMoney(p.amount) }) : '', target: { screen: 'Payments' }, icon: Wallet, tone: 'marigold' };
        case 'dispute.raised':
          return { title: t('disputeRaised.title'), body: t('disputeRaised.body'), target: null, icon: Scale, tone: 'danger' };
        case 'dispute.resolved':
          return { title: t('disputeResolved.title'), body: t('disputeResolved.body'), target: null, icon: Scale, tone: 'mint' };
        case 'safety_incident.sos.contact':
          return { title: t('sosContact.title'), body: typeof p.contact === 'string' ? t('sosContact.body', { contact: p.contact }) : '', target: visit, icon: Siren, tone: 'danger' };
        case 'safety_incident.updated': {
          const raw = String(p.status ?? '');
          const status = INCIDENT_STATUSES.includes(raw) ? L.incidentStatus(raw as IncidentStatus) : raw.replace('_', ' ').toLowerCase();
          return { title: t('safetyUpdated.title'), body: t('safetyUpdated.body', { status }), target: null, icon: ShieldCheck, tone: 'ink' };
        }
        case 'payment.cash.caregiver_confirmed':
          return { title: tm('cashCaregiverConfirmed.title'), body: tm('cashCaregiverConfirmed.body', { amount: typeof p.amount === 'number' ? formatMoney(p.amount) : '' }), target: visit, icon: Wallet, tone: 'marigold' };
        case 'payment.failed':
          return { title: tm('paymentFailed.title'), body: tm('paymentFailed.body'), target: visit ?? { screen: 'Payments' }, icon: CircleX, tone: 'danger' };
        case 'booking.completed':
          return { title: tm('bookingCompleted.title'), body: tm('bookingCompleted.body'), target: booking, icon: CircleCheck, tone: 'mint' };
        default:
          return { title: n.title || n.event.replace(/[._]/g, ' '), body: n.body ?? '', target: null, icon: Bell, tone: 'ink' };
      }
    },
    [t, tm, L],
  );
}

type Section = { key: string; title: string; data: AppNotification[] };

/**
 * FR-C10: the in-app (PUSH) feed, grouped by day (Today / Yesterday / date).
 * Each row's tile says what kind of update it is; unread rows are bold with a
 * small dot. Opening the screen marks everything read.
 */
export function NotificationsScreen({ navigation }: CustomerScreen<'Notifications'>) {
  const insets = useSafeAreaInsets();
  const t = useT('customerA.notifications');
  const tm = useT('mobileCustomer.notifications');
  const f = useFmt();
  const list = useQuery([...keys.notifications, 'list'], () => notificationsApi.list({ channel: 'PUSH', limit: 50 }));
  const items = useMemo(() => (list.data?.items ?? []).filter(n => n.channel === 'PUSH'), [list.data]);
  // Snapshot of what was unread on arrival, so new rows stay highlighted while open.
  const unreadOnOpen = useRef<Set<string> | null>(null);
  if (!unreadOnOpen.current && list.data) unreadOnOpen.current = new Set(items.filter(n => !n.readAt).map(n => n.id));

  const newest = items[0]?.createdAt;
  useEffect(() => {
    if (!newest || !items.some(n => !n.readAt)) return;
    notificationsApi
      .markRead({ before: newest })
      .then(() => invalidate(keys.notifications))
      .catch(() => {});
  }, [newest, items]);

  const sections = useMemo<Section[]>(() => {
    const byDay = new Map<string, AppNotification[]>();
    for (const n of items) {
      const day = localDayKey(new Date(n.createdAt).getTime());
      byDay.set(day, [...(byDay.get(day) ?? []), n]);
    }
    return [...byDay.entries()].map(([day, data]) => ({ key: day, title: f.relativeDay(day), data }));
  }, [items, f]);

  const go = useCallback(
    (target: Target) => {
      if (!target) return;
      if (target.screen === 'Payments') navigation.navigate('Payments');
      else navigation.navigate(target.screen, { id: target.id });
    },
    [navigation],
  );
  const describe = useDescribe();
  const renderItem = useCallback(
    ({ item, index, section }: { item: AppNotification; index: number; section: Section }) => (
      <Row n={item} v={describe(item)} isNew={!!unreadOnOpen.current?.has(item.id)} first={index === 0} last={index === section.data.length - 1} onPress={go} />
    ),
    [describe, go],
  );

  return (
    <Screen title={t('title')} back scroll={false}>
      {list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={n => n.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          // Stack screen, edge-to-edge: keep the last row above the system nav bar.
          contentContainerStyle={[styles.list, { paddingBottom: space.xxxl + insets.bottom }]}
          refreshControl={<RefreshControl refreshing={list.isFetching && !list.isLoading} onRefresh={list.refetch} colors={[brand[600]]} />}
          ListEmptyComponent={list.isLoading ? <SkeletonList count={4} height={72} /> : <EmptyState title={t('empty')} text={tm('emptyText')} />}
        />
      )}
    </Screen>
  );
}

const renderSectionHeader = ({ section }: { section: Section }) => (
  <Text variant="small" weight="bold" color={ink[600]} style={styles.sectionTitle} accessibilityRole="header">
    {section.title}
  </Text>
);

const Row = memo(function NotificationRow({
  n,
  v,
  isNew,
  first,
  last,
  onPress,
}: {
  n: AppNotification;
  v: View_;
  isNew: boolean;
  first: boolean;
  last: boolean;
  onPress: (t: Target) => void;
}) {
  const f = useFmt();
  const content = (
    <>
      <IconTile icon={v.icon} tone={v.tone} size={42} />
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text variant="small" weight={isNew ? 'bold' : 'semibold'} color={isNew ? colors.text : ink[700]} style={styles.title}>
            {v.title}
          </Text>
          <Text variant="caption" color={colors.textSubtle} numberOfLines={1}>
            {f.relativeTime(n.createdAt)}
          </Text>
        </View>
        {!!v.body && (
          <Text variant="small" color={colors.textMuted}>
            {v.body}
          </Text>
        )}
      </View>
    </>
  );
  const style = [styles.row, first && styles.rowFirst, last && styles.rowLast, !last && styles.rowDivider, isNew && styles.rowNew];
  return v.target ? (
    <Touchable onPress={() => onPress(v.target)} accessibilityRole="button" pressScale={false} style={style}>
      {content}
    </Touchable>
  ) : (
    <View style={style}>{content}</View>
  );
});

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  list: { paddingHorizontal: space.lg, paddingTop: space.sm },
  sectionTitle: { paddingTop: space.lg, paddingBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderStartWidth: 1,
    borderEndWidth: 1,
  },
  rowFirst: { borderTopWidth: 1, borderTopStartRadius: radius.lg, borderTopEndRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomStartRadius: radius.lg, borderBottomEndRadius: radius.lg },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ink[100] },
  rowNew: { backgroundColor: brand[50] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1 },
}));
