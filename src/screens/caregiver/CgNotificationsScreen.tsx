import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationsApi } from '../../api/caregiver/api';
import { keys } from '../../api/caregiver/keys';
import type { AppNotification, IncidentStatus } from '../../api/types';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Bell, Banknote, CalendarClock, CircleX, ClipboardList, FileText, Scale, ShieldCheck, type IconType } from '../../components/icons';
import { DirChevron, IconTile, Touchable, type TileTone, type Tone } from '../../components/ui';
import { useT } from '../../i18n';
import { formatMoney, localDayKey, useFmt, useLabels } from '../../i18n/format';
import { invalidate, useQuery } from '../../lib/query';
import type { CaregiverScreen, CaregiverTabs } from '../../navigation/types';
import { brand, colors, ink, space, themed } from '../../theme';

type Target = { tab: keyof CaregiverTabs } | { visit: string } | { screen: 'Reports' | 'Earnings' } | null;
interface View_ {
  title: string;
  body: string;
  target: Target;
  tone: Tone;
}

/** Status tone -> icon-tile tone (brand palette only). */
const TILE_TONE: Record<Tone, TileTone> = { brand: 'teal', accent: 'marigold', danger: 'danger', success: 'mint', neutral: 'ink', warning: 'sand', info: 'teal' };

/** What the event is about, at a glance. */
function iconFor(event: string): IconType {
  if (event === 'booking.requested') return ClipboardList;
  if (event === 'booking.cancelled') return CircleX;
  if (event === 'booking.prescription.uploaded') return FileText;
  if (event.startsWith('visit.')) return CalendarClock;
  if (event.startsWith('dispute.')) return Scale;
  if (event.startsWith('payout.')) return Banknote;
  if (event.startsWith('safety')) return ShieldCheck;
  return Bell;
}

const INCIDENT_STATUSES: readonly string[] = ['OPEN', 'IN_REVIEW', 'RESOLVED'];

/** Caregiver event catalogue -> text; mirrors the web's useDescribe(). */
function useDescribe() {
  const t = useT('caregiverA.notifications');
  const tm = useT('mobileCaregiver.notifications.events');
  const L = useLabels();
  const f = useFmt();
  return useCallback(
    (n: AppNotification): View_ => {
      const p = n.payload;
      const amount = typeof p.amount === 'number' ? formatMoney(p.amount) : '';
      const visit: Target = typeof p.visitId === 'string' ? { visit: p.visitId } : null;
      switch (n.event) {
        case 'booking.requested':
          return {
            title: t('events.bookingRequested.title'),
            body: Number(p.visits) > 0 ? t('events.bookingRequested.body', { count: Number(p.visits) }) : t('events.bookingRequested.bodyNoCount'),
            target: { tab: 'Requests' },
            tone: 'accent',
          };
        case 'booking.cancelled':
          return { title: t('events.bookingCancelled.title'), body: t('events.bookingCancelled.body'), target: { tab: 'Visits' }, tone: 'neutral' };
        case 'booking.prescription.uploaded':
          return { title: t('events.prescriptionUploaded.title'), body: t('events.prescriptionUploaded.body'), target: { tab: 'Requests' }, tone: 'brand' };
        case 'visit.rescheduled':
          return {
            title: t('events.visitRescheduled.title'),
            body: t('events.visitRescheduled.body', {
              date: typeof p.scheduledDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p.scheduledDate) ? f.longDay(p.scheduledDate) : t('newDate'),
            }),
            target: typeof p.visitId === 'string' ? { visit: p.visitId } : { tab: 'Visits' },
            tone: 'brand',
          };
        case 'dispute.raised':
          return { title: t('events.disputeRaised.title'), body: t('events.disputeRaised.body'), target: { screen: 'Reports' }, tone: 'danger' };
        case 'dispute.resolved':
          return { title: t('events.disputeResolved.title'), body: t('events.disputeResolved.body'), target: { screen: 'Reports' }, tone: 'success' };
        case 'payout.processing':
          return { title: t('events.payoutProcessing.title'), body: t('events.payoutProcessing.body', { amount }), target: { screen: 'Earnings' }, tone: 'brand' };
        case 'payout.paid':
          return { title: t('events.payoutPaid.title'), body: t('events.payoutPaid.body', { amount }), target: { screen: 'Earnings' }, tone: 'success' };
        case 'payout.rejected':
          return { title: t('events.payoutRejected.title'), body: t('events.payoutRejected.body', { amount }), target: { screen: 'Earnings' }, tone: 'danger' };
        case 'safety_incident.updated': {
          const raw = String(p.status ?? '');
          const status = INCIDENT_STATUSES.includes(raw) ? L.incidentStatus(raw as IncidentStatus) : raw.replace('_', ' ').toLowerCase();
          return { title: t('events.safetyUpdated.title'), body: t('events.safetyUpdated.body', { status }), target: { screen: 'Reports' }, tone: 'neutral' };
        }
        case 'payment.cash.initiated':
          return { title: tm('cashInitiated.title'), body: tm('cashInitiated.body', { amount }), target: visit, tone: 'accent' };
        case 'payment.cash.customer_confirmed':
          return { title: tm('cashCustomerConfirmed.title'), body: tm('cashCustomerConfirmed.body', { amount }), target: visit, tone: 'accent' };
        case 'payment.paid':
          return { title: tm('paymentPaid.title'), body: tm('paymentPaid.body', { amount }), target: visit ?? { screen: 'Earnings' }, tone: 'success' };
        case 'booking.completed':
          return { title: tm('bookingCompleted.title'), body: tm('bookingCompleted.body'), target: { tab: 'Visits' }, tone: 'success' };
        case 'review.received':
          return { title: tm('reviewReceived.title'), body: tm('reviewReceived.body'), target: visit, tone: 'brand' };
        case 'payout.transferred':
          return { title: tm('payoutTransferred.title'), body: tm('payoutTransferred.body', { amount }), target: { screen: 'Earnings' }, tone: 'accent' };
        case 'caregiver.verification.approved':
          return { title: tm('verificationApproved.title'), body: tm('verificationApproved.body'), target: null, tone: 'success' };
        case 'caregiver.verification.rejected':
          return { title: tm('verificationRejected.title'), body: tm('verificationRejected.body'), target: null, tone: 'danger' };
        default:
          return { title: n.title || n.event.replace(/[._]/g, ' '), body: n.body ?? '', target: null, tone: 'neutral' };
      }
    },
    [t, tm, L, f],
  );
}

const Row = memo(function NotificationRow({ n, onOpen }: { n: AppNotification; onOpen: (target: Target) => void }) {
  const describe = useDescribe();
  const f = useFmt();
  const d = describe(n);
  const unread = !n.readAt;
  return (
    <Touchable onPress={() => onOpen(d.target)} disabled={!d.target} accessibilityRole="button" pressScale={false} style={[styles.row, unread && styles.unread]}>
      <IconTile icon={iconFor(n.event)} tone={TILE_TONE[d.tone]} size={44} />
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text weight={unread ? 'bold' : 'semibold'} style={styles.flex} numberOfLines={2}>
            {d.title}
          </Text>
          {/* Not `numeric`: "5 منٹ پہلے" is Urdu text, not a bare number. */}
          <Text variant="caption" color={colors.textSubtle} numberOfLines={1}>
            {f.relativeTime(n.createdAt)}
          </Text>
        </View>
        {!!d.body && (
          <Text variant="small" color={colors.textMuted}>
            {d.body}
          </Text>
        )}
      </View>
      {/* Unread rows are tinted and bold; no dot. */}
      {d.target ? <DirChevron /> : null}
    </Touchable>
  );
});

type Section = { title: string; data: AppNotification[] };

/** Today / Yesterday / "Sat, 25 Oct" groups, newest first. */
function useSections(items: AppNotification[]): Section[] {
  const f = useFmt();
  return useMemo(() => {
    const groups = new Map<string, AppNotification[]>();
    for (const n of items) {
      const k = localDayKey(new Date(n.createdAt).getTime());
      groups.set(k, [...(groups.get(k) ?? []), n]);
    }
    return [...groups.entries()].map(([k, data]) => ({ title: f.relativeDay(k), data }));
  }, [items, f]);
}

export function CgNotificationsScreen({ navigation }: CaregiverScreen<'CgNotifications'>) {
  const t = useT('caregiverA.notifications');
  const insets = useSafeAreaInsets();
  const list = useQuery([...keys.notifications, 'list'], () => notificationsApi.list({ channel: 'PUSH', limit: 50 }));

  // Opening the screen marks everything seen so far as read.
  const marked = useRef(false);
  useEffect(() => {
    if (!list.data || marked.current) return;
    marked.current = true;
    if (list.data.items.some(n => !n.readAt)) {
      notificationsApi
        .markRead({ before: new Date().toISOString() })
        .then(() => invalidate([...keys.notifications, 'unread']))
        .catch(() => undefined);
    }
  }, [list.data]);

  const open = useCallback(
    (target: Target) => {
      if (!target) return;
      if ('visit' in target) navigation.navigate('CgVisitDetail', { id: target.visit });
      else if ('screen' in target) navigation.navigate(target.screen);
      else navigation.navigate('CaregiverTabs', { screen: target.tab });
    },
    [navigation],
  );
  const renderItem = useCallback(({ item }: { item: AppNotification }) => <Row n={item} onOpen={open} />, [open]);
  const sections = useSections(list.data?.items ?? []);

  return (
    <Screen title={t('title')} back scroll={false}>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : list.isLoading ? (
        <View style={styles.pad}>
          <SkeletonList count={5} height={72} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={n => n.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <Text variant="small" weight="bold" color={ink[600]} style={styles.sectionHead}>
              {section.title}
            </Text>
          )}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={<EmptyState title={t('empty')} />}
          refreshing={list.isFetching && !list.isLoading}
          onRefresh={list.refetch}
          // Edge-to-edge: keep the last row above the system navigation bar.
          contentContainerStyle={[styles.list, { paddingBottom: space.xxxl + insets.bottom }]}
        />
      )}
    </Screen>
  );
}

const Separator = () => <View style={styles.sep} />;

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: space.lg },
  list: { paddingBottom: space.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 72, backgroundColor: colors.surface },
  unread: { backgroundColor: brand[50] },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  sectionHead: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm, backgroundColor: colors.bg },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: ink[100], marginStart: space.lg + 44 + space.md },
}));
