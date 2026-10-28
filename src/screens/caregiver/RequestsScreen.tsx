import React, { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { bookingsApi, profileApi } from '../../api/caregiver/api';
import { keys } from '../../api/caregiver/keys';
import type { CaregiverBookingListItem } from '../../api/types';
import { TextField } from '../../components/form';
import { CalendarDays, Check, Clock, MapPin, X } from '../../components/icons';
import { Sheet } from '../../components/overlay';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Text, useTextStyle } from '../../components/Text';
import { Avatar, Badge, Button, Card, Chip, Segmented } from '../../components/ui';
import { useT } from '../../i18n';
import { useFmt, useLabels } from '../../i18n/format';
import { invalidate, useAction, useQuery } from '../../lib/query';
import { brand, colors, ink, radius, space, themed } from '../../theme';
import { RespondCountdown } from './components/Bits';
import { useNow } from './components/helpers';

const DECLINE_REASONS = ['notAvailable', 'tooFar', 'outsideSpecialty', 'fullyBooked'] as const;

function DeclineSheet({ booking, onClose }: { booking: CaregiverBookingListItem | null; onClose: () => void }) {
  const t = useT('caregiverA.requests.decline');
  const [reason, setReason] = useState('');
  const decline = useAction(() => bookingsApi.decline(booking!.id, reason.trim() || undefined), {
    invalidate: [keys.bookings, keys.visits],
    success: t('success'),
    onSuccess: () => {
      setReason('');
      onClose();
    },
    // Request already gone (customer cancelled): drop the stale card.
    onError: () => invalidate(keys.bookings),
  });
  return (
    <Sheet
      visible={!!booking}
      onClose={onClose}
      title={t('title')}
      footer={
        <View style={styles.gapSm}>
          <Button label={t('confirm')} variant="danger" size="lg" block loading={decline.isPending} onPress={() => decline.run(undefined)} />
          <Button label={t('keep')} variant="secondary" block onPress={onClose} />
        </View>
      }>
      {booking && (
        <Text color={colors.textMuted}>{t('description', { name: booking.patient.name, count: booking.visits.length })}</Text>
      )}
      <View style={styles.chips}>
        {DECLINE_REASONS.map(k => {
          const r = t(`reasons.${k}`);
          return <Chip key={k} label={r} selected={reason === r} onPress={() => setReason(r)} />;
        })}
      </View>
      <TextField label={t('reasonLabel')} hint={t('reasonHint', { count: reason.length })} value={reason} onChangeText={setReason} multiline maxLength={500} />
    </Sheet>
  );
}

const RequestCard = memo(function RequestCardView({ booking, commissionPct, onDecline }: { booking: CaregiverBookingListItem; commissionPct: number | null; onDecline: (b: CaregiverBookingListItem) => void }) {
  const t = useT('caregiverA.requests.card');
  const tm = useT('mobileCaregiver.requests');
  const f = useFmt();
  const L = useLabels();
  const accept = useAction(() => bookingsApi.accept(booking.id), {
    invalidate: [keys.bookings, keys.visits],
    success: t('accepted', { count: booking.visits.length }),
    onError: () => invalidate(keys.bookings),
  });
  // FR-CG5: once the response window has passed, the request can no longer be accepted.
  const now = useNow(15_000);
  const expired = new Date(booking.respondBy).getTime() <= now;
  const perVisit = booking.rateSnapshot - booking.discountAmount;
  // Mirror the backend split exactly (caregiverAmount = amount − round(amount·pct/100)).
  const youEarn = commissionPct !== null ? perVisit - Math.round((perVisit * commissionPct) / 100) : null;
  const recurring = booking.type === 'RECURRING' && booking.recurrenceRule;

  return (
    <Card padded={false} style={styles.card}>
      <View style={styles.cardBody}>
        <View style={styles.head}>
          <Avatar name={booking.patient.name} size={48} />
          <View style={styles.flex}>
            <Text variant="lead" weight="extrabold" numberOfLines={1}>
              {booking.patient.name}
            </Text>
            <Text variant="small" color={colors.textMuted} numberOfLines={2}>
              {`${L.specialty(booking.serviceType)} · ${booking.patient.relationship === 'SELF' ? t('bookedByPatient') : t('bookedByFamily')}`}
            </Text>
          </View>
        </View>

        <View style={styles.countRow}>
          <RespondCountdown respondBy={booking.respondBy} />
          <Text variant="caption" color={colors.textMuted} style={styles.flex} numberOfLines={1}>
            {t('requested', { time: f.relativeTime(booking.createdAt) })}
          </Text>
        </View>

        <View style={styles.facts}>
          <View style={styles.line}>
            <LineIcon>
              <CalendarDays size={16} color={brand[600]} />
            </LineIcon>
            <Text variant="small" weight="semibold" color={ink[800]} style={styles.flex}>
              {recurring ? `${t('visitCount', { count: booking.visits.length })} · ${f.weekdays(booking.recurrenceRule!.weekdays)}` : f.relativeDay(booking.startDate)}
            </Text>
          </View>
          {recurring && (
            <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.factIndent}>
              {`${f.relativeDay(booking.startDate)} – ${f.relativeDay(booking.endDate)}`}
            </Text>
          )}
          <View style={styles.line}>
            <LineIcon>
              <Clock size={16} color={brand[600]} />
            </LineIcon>
            <Text variant="small" weight="semibold" color={ink[800]} numberOfLines={1} style={[styles.shrink, styles.ltr]}>
              {f.timeWindow(booking.timeWindowStart, booking.timeWindowEnd)}
            </Text>
          </View>
          <View style={styles.line}>
            <LineIcon>
              <MapPin size={16} color={brand[600]} />
            </LineIcon>
            <Text variant="small" color={ink[700]} style={styles.flex}>
              {`${booking.address.addressLine}, ${booking.address.city}`}
            </Text>
          </View>
        </View>

        <View style={styles.earn}>
          <View style={styles.flex}>
            <Text variant="caption" weight="semibold" color={brand[700]} numberOfLines={1}>
              {tm('youEarn')}
            </Text>
            <Text variant="h2" weight="extrabold" color={brand[800]} numeric tabular numberOfLines={1} style={styles.ltrStart}>
              {f.money(youEarn ?? perVisit)}
            </Text>
          </View>
          <View style={styles.earnSide}>
            {commissionPct !== null && (
              <Text variant="caption" color={brand[700]} align="center">
                {tm('afterCommission', { pct: commissionPct })}
              </Text>
            )}
            <Text variant="caption" color={colors.textMuted} align="center">
              {tm('familyPays', { amount: f.money(perVisit) })}
            </Text>
          </View>
        </View>

        {(recurring || booking.discountAmount > 0) && (
          <View style={styles.badges}>
            {recurring && <Badge tone="brand" label={t('recurringCare')} />}
            {booking.discountAmount > 0 && <Badge tone="accent" label={t('promo', { amount: f.money(booking.discountAmount) })} />}
          </View>
        )}
      </View>
      <View style={styles.cardActions}>
        <Button label={t('decline')} icon={X} variant="dangerOutline" size="lg" style={styles.flex} disabled={accept.isPending} onPress={() => onDecline(booking)} />
        <Button label={t('accept')} icon={Check} variant="success" size="lg" style={styles.flex} disabled={expired} loading={accept.isPending} onPress={() => accept.run(undefined)} />
      </View>
    </Card>
  );
});

const HistoryRow = memo(function HistoryRowView({ booking }: { booking: CaregiverBookingListItem }) {
  const t = useT('caregiverA.requests.history');
  const f = useFmt();
  const L = useLabels();
  const tone = booking.status === 'CONFIRMED' ? 'success' : booking.status === 'DECLINED' ? 'neutral' : 'danger';
  return (
    <View style={styles.history}>
      <View style={styles.flex}>
        <Text weight="semibold" numberOfLines={1}>
          {booking.patient.name}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {t('line', { count: booking.visits.length, day: f.relativeDay(booking.startDate) })}
          {booking.cancelReason ? t('reason', { reason: booking.cancelReason }) : ''}
        </Text>
      </View>
      <Badge tone={tone} label={L.bookingCaregiver(booking.status)} />
    </View>
  );
});

/** FR-CG5: accept or decline incoming requests within the response window. */
export function RequestsScreen() {
  const t = useT('caregiverA.requests');
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [declining, setDeclining] = useState<CaregiverBookingListItem | null>(null);

  const pending = useQuery([...keys.bookings, 'list', 'REQUESTED'], () => bookingsApi.list({ status: 'REQUESTED', limit: 50 }));
  const all = useQuery([...keys.bookings, 'list', 'all'], () => bookingsApi.list({ limit: 50 }), { enabled: tab === 'history' });
  const profile = useQuery(keys.profile, profileApi.get);
  const pct = profile.data ? Number(profile.data.commissionRate.percentage) : null;

  const items = useMemo(() => [...(pending.data?.items ?? [])].sort((a, b) => a.respondBy.localeCompare(b.respondBy)), [pending.data]);
  const history = useMemo(() => (all.data?.items ?? []).filter(b => b.status !== 'REQUESTED'), [all.data]);

  const renderCard = useCallback(({ item }: { item: CaregiverBookingListItem }) => <RequestCard booking={item} commissionPct={pct} onDecline={setDeclining} />, [pct]);
  const renderHistory = useCallback(({ item }: { item: CaregiverBookingListItem }) => <HistoryRow booking={item} />, []);

  const query = tab === 'pending' ? pending : all;
  const header = (
    <View style={styles.listHead}>
      <Text color={colors.textMuted}>{t('description')}</Text>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: pending.data ? `${t('tabs.waiting')} (${pending.data.total})` : t('tabs.waiting') },
          { value: 'history', label: t('tabs.responded') },
        ]}
      />
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
          <SkeletonList count={2} height={260} />
        </View>
      ) : tab === 'pending' ? (
        <FlatList
          data={items}
          keyExtractor={b => b.id}
          renderItem={renderCard}
          ListHeaderComponent={header}
          ListEmptyComponent={<EmptyState title={t('caughtUp')} text={t('caughtUpHint')} />}
          contentContainerStyle={styles.list}
          refreshing={pending.isFetching && !pending.isLoading}
          onRefresh={pending.refetch}
        />
      ) : (
        <FlatList
          data={history}
          keyExtractor={b => b.id}
          renderItem={renderHistory}
          ListHeaderComponent={header}
          ListEmptyComponent={<EmptyState title={t('noResponses')} />}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.list}
          refreshing={all.isFetching && !all.isLoading}
          onRefresh={all.refetch}
        />
      )}
      <DeclineSheet booking={declining} onClose={() => setDeclining(null)} />
    </Screen>
  );
}

const Separator = () => <View style={styles.sep} />;

/**
 * Holds a row icon at the height of the first text line, so it lines up with
 * the text in both scripts (Urdu's first line is ~27dp, English ~20dp).
 */
function LineIcon({ children }: { children: React.ReactNode }) {
  const { lineHeight } = useTextStyle('small');
  return <View style={{ height: lineHeight, justifyContent: 'center' }}>{children}</View>;
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  ltr: { writingDirection: 'ltr' },
  gapSm: { gap: space.sm },
  pad: { padding: space.lg, gap: space.lg },
  list: { padding: space.lg, gap: space.lg, paddingBottom: space.xxxl },
  listHead: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  ltrStart: { writingDirection: 'ltr', alignSelf: 'flex-start', maxWidth: '100%' },
  card: { overflow: 'hidden', borderRadius: radius.lg + 4 },
  cardBody: { padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  facts: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: ink[25], borderWidth: 1, borderColor: ink[100] },
  factIndent: { paddingStart: 24 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  earn: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: brand[50] },
  earnSide: { maxWidth: '45%', gap: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cardActions: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.lg },
  history: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, backgroundColor: colors.bg },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: ink[200] },
}));
