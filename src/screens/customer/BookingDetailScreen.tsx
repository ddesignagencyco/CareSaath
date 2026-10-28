import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { bookingsApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import type { PrescriptionSummary, Visit } from '../../api/types';
import { TextField } from '../../components/form';
import { FileText, Navigation, Plus, Repeat } from '../../components/icons';
import { ConfirmSheet } from '../../components/overlay';
import { ErrorState, Screen, Section, Skeleton } from '../../components/screen';
import { RichText, Text } from '../../components/Text';
import { Avatar, Badge, Button, Card, DateBlock, DirChevron, Divider, Touchable } from '../../components/ui';
import { useT } from '../../i18n';
import { formatBytes, formatMoney, useFmt, useLabels } from '../../i18n/format';
import { useAction, useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { accent, brand, colors, feedback, ink, radius, space, themed } from '../../theme';
import { AttachSheet } from './components/attach';
import { BOOKING_TONE, Banner, Rating, VISIT_TONE, bookingDisplayStatus, firstName, hasCancellableVisits, useCaregiver, useDayLabel, visitStart } from './components/bits';
import { CalendarClock, CircleX } from './components/icons';
import { MessageButton } from '../shared/chat/MessageButton';
import { RescheduleSheet, usePayments } from './components/panels';
import { FileViewerSheet } from './components/viewer';

/** "2h 14m left" until the caregiver's response window closes (FR-CG5). */
function Countdown({ until }: { until: string }) {
  const t = useT('shared.countdown');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return <Badge tone="neutral" label={t('passed')} style={styles.start} />;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return <Badge tone="accent" label={t('left', { time: t('hours', { h, m }) })} style={styles.start} />;
}

export function BookingDetailScreen({ route, navigation }: CustomerScreen<'BookingDetail'>) {
  const { id } = route.params;
  const t = useT('customerB.booking');
  const tc = useT('common.actions');
  const tchat = useT('mobile.chat');
  const ts = useT('shared.reason');
  const f = useFmt();
  const dateOf = useDayLabel();
  const L = useLabels();
  const booking = useQuery([...keys.bookings, 'detail', id], () => bookingsApi.get(id));
  const payments = usePayments();
  const b = booking.data;
  const caregiver = useCaregiver(b?.caregiverId);
  const c = caregiver.data;
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [moving, setMoving] = useState<Visit | null>(null);
  const [viewing, setViewing] = useState<PrescriptionSummary | null>(null);
  const [attaching, setAttaching] = useState(false);

  const payItems = payments.data?.items ?? [];
  const payState = (visitId: string, status: string): 'paid' | 'pending' | 'due' | null => {
    if (payItems.some(p => p.visitId === visitId && p.status === 'PAID')) return 'paid';
    if (payItems.some(p => p.visitId === visitId && p.status === 'PENDING')) return 'pending';
    return status === 'COMPLETED' || status === 'CHECKED_OUT' ? 'due' : null;
  };

  const cancel = useAction(() => bookingsApi.cancel(id, reason.trim() || undefined), {
    invalidate: [keys.bookings],
    success: t('cancelSuccess'),
    onSuccess: () => setCancelling(false),
  });
  const upload = useAction(bookingsApi.uploadPrescription.bind(null, id), { invalidate: [keys.bookings], success: t('uploadSuccess') });

  if (booking.error && !b) {
    return (
      <Screen title={t('back')} back>
        <ErrorState error={booking.error} onRetry={booking.refetch} />
      </Screen>
    );
  }
  if (!b) {
    return (
      <Screen back>
        <Skeleton height={120} />
        <Skeleton height={240} />
      </Screen>
    );
  }

  const open = b.status === 'REQUESTED' || b.status === 'CONFIRMED';
  const shown = bookingDisplayStatus(b);
  const perVisit = b.rateSnapshot - b.discountAmount;
  const due = b.visits.find(v => payState(v.id, v.status) === 'due');
  const now = Date.now();

  return (
    <Screen
      back
      title={t('heading', { service: L.specialty(b.serviceType), patient: b.patient.name })}
      subtitle={t('requestedAt', { date: f.dateTime(b.createdAt) })}
      refreshing={booking.isFetching}
      onRefresh={booking.refetch}
      footer={hasCancellableVisits(b) ? <Button label={t('cancelBooking')} icon={CircleX} variant="dangerOutline" block onPress={() => setCancelling(true)} /> : undefined}>
      {/* Status once: the banners below say requested / declined / cancelled, and a
          single visit's row carries its own badge. Only a multi-visit booking needs it here. */}
      {!!b.recurrenceRule && b.status !== 'REQUESTED' && b.status !== 'DECLINED' && b.status !== 'CANCELLED' && (
        <Badge tone={BOOKING_TONE[shown]} label={L.bookingCustomer(shown)} style={styles.start} />
      )}

      {b.status === 'REQUESTED' && (
        <Banner tone="accent">
          <RichText variant="small" color={accent[700]}>
            {t.raw('waitingBanner', { name: c ? firstName(c.user.fullName) : t('theCaregiver') })}
          </RichText>
          <View style={styles.mt}>
            <Countdown until={b.respondBy} />
          </View>
        </Banner>
      )}
      {b.status === 'DECLINED' && (
        <Banner tone="neutral">
          <Text variant="small" weight="bold" color={ink[700]}>
            {t('declinedTitle')}
          </Text>
          {!!b.cancelReason && <Text variant="small" color={ink[700]}>“{b.cancelReason}”</Text>}
          <Button label={t('findAnother')} variant="ghost" onPress={() => navigation.navigate('CustomerTabs', { screen: 'FindCare', params: { specialty: b.serviceType } })} style={styles.ghostStart} />
        </Banner>
      )}
      {b.status === 'CANCELLED' && (
        <Banner tone="neutral">
          {b.cancelReason ? t('cancelledWithReason', { date: f.dateTime(b.cancelledAt), reason: b.cancelReason }) : t('cancelledAt', { date: f.dateTime(b.cancelledAt) })}
        </Banner>
      )}
      {due && (
        <Touchable onPress={() => navigation.navigate('VisitDetail', { id: due.id })} accessibilityRole="button" style={styles.dueBanner}>
          <Text variant="small" weight="semibold" color={feedback.danger700} style={styles.flex}>
            {t('paymentDueBanner')}
          </Text>
          <Text variant="small" weight="bold" color={feedback.danger700} numberOfLines={1}>
            {t('payNow')}
          </Text>
          <DirChevron color={feedback.danger700} />
        </Touchable>
      )}

      <Section title={t('visits')}>
        {!!b.recurrenceRule && (
          <Text variant="small" color={colors.textMuted}>
            {`${f.weekdays(b.recurrenceRule.weekdays)} · ${f.timeWindow(b.timeWindowStart, b.timeWindowEnd)}`}
          </Text>
        )}
        <Card padded={false}>
          {b.visits.map((v, i) => {
            const canMove = open && (v.status === 'REQUESTED' || v.status === 'CONFIRMED') && visitStart(v.scheduledDate, v.timeWindowStart) > now;
            const ps = payState(v.id, v.status);
            const closed = v.status === 'CANCELLED' || v.status === 'DECLINED';
            return (
              <View key={v.id}>
                {i > 0 && <Divider inset={space.lg} />}
                <View style={closed && styles.dim}>
                  <Touchable onPress={() => navigation.navigate('VisitDetail', { id: v.id })} accessibilityRole="button" pressScale={false} style={styles.visitMain}>
                    <DateBlock day={dateOf(v.scheduledDate).day} label={dateOf(v.scheduledDate).label} highlight={dateOf(v.scheduledDate).isToday && !closed} />
                    <View style={styles.flex}>
                      <Text variant="small" weight="bold" numberOfLines={1}>
                        {f.longDay(v.scheduledDate)}
                      </Text>
                      <Text variant="caption" color={colors.textMuted} tabular numberOfLines={1}>
                        {f.timeWindow(v.timeWindowStart, v.timeWindowEnd)}
                      </Text>
                      <View style={styles.badges}>
                        <Badge tone={VISIT_TONE[v.status]} label={L.visitCustomer(v.status)} />
                        {ps === 'paid' ? <Badge tone="success" label={t('paid')} /> : ps === 'pending' ? <Badge tone="accent" label={t('paymentPending')} /> : ps === 'due' ? <Badge tone="danger" label={t('paymentDue')} /> : null}
                      </View>
                    </View>
                    <DirChevron />
                  </Touchable>
                  {/* Under the row, not beside it: beside, it squeezed the date and badges (Urdu most). */}
                  {canMove && <Button label={t('reschedule')} icon={CalendarClock} variant="ghost" onPress={() => setMoving(v)} style={styles.reschedule} />}
                </View>
              </View>
            );
          })}
        </Card>
      </Section>

      <Section title={t('prescriptions')} action={open ? <Button label={tc('add')} icon={Plus} variant="secondary" loading={upload.isPending} onPress={() => setAttaching(true)} /> : undefined}>
        <Text variant="small" color={colors.textMuted}>
          {t('prescriptionsHint')}
        </Text>
        {b.prescriptions.length === 0 ? (
          <Card>
            <Text variant="small" color={colors.textMuted}>
              {t('prescriptionsEmpty')}
            </Text>
          </Card>
        ) : (
          b.prescriptions.map(p => (
            <Card key={p.id} onPress={() => setViewing(p)} style={styles.rx}>
              <View style={styles.rxIcon}>
                <FileText size={20} color={brand[600]} />
              </View>
              <View style={styles.flex}>
                <Text variant="small" weight="semibold" numberOfLines={1}>
                  {t('prescription')}
                </Text>
                <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {formatBytes(p.sizeBytes)} · {f.dateTime(p.createdAt)}
                </Text>
              </View>
              <Text variant="small" weight="bold" color={colors.primaryText} numberOfLines={1}>
                {tc('view')}
              </Text>
            </Card>
          ))
        )}
      </Section>

      <Section title={t('caregiver')}>
        {c ? (
          <>
            <Card onPress={() => navigation.navigate('CaregiverProfile', { id: c.id })} style={styles.cg}>
              <Avatar name={c.user.fullName} uri={c.photoUrl} />
              <View style={styles.flex}>
                <Text weight="bold" numberOfLines={1}>
                  {c.user.fullName}
                </Text>
                <Rating average={c.ratingAverage} count={c.ratingCount} />
              </View>
              <DirChevron />
            </Card>
            <MessageButton peer={{ id: c.id, name: c.user.fullName, role: c.specialty, photoUrl: c.photoUrl }} label={tchat('messageCaregiver')} />
          </>
        ) : caregiver.error ? (
          <Card>
            <Text variant="small" color={colors.textMuted}>
              {t('caregiverUnavailable')}
            </Text>
          </Card>
        ) : (
          <Skeleton height={72} />
        )}
      </Section>

      <Section title={t('address')}>
        <Card style={styles.gapSm}>
          <Text weight="bold" numberOfLines={1}>
            {b.address.label ?? t('address')}
          </Text>
          <Text variant="small" color={ink[700]}>
            {b.address.addressLine}, {b.address.city}
          </Text>
          <Button
            label={t('openInMaps')}
            icon={Navigation}
            variant="secondary"
            onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${b.address.latitude},${b.address.longitude}`).catch(() => {})}
            style={styles.ghostStart}
          />
        </Card>
      </Section>

      <Section title={t('price')}>
        <Card style={styles.gapSm}>
          <PriceRow label={t('perVisit')} value={formatMoney(b.rateSnapshot)} />
          {b.discountAmount > 0 && <PriceRow label={t('promoDiscount')} value={formatMoney(-b.discountAmount)} color={feedback.success700} />}
          <Divider />
          <PriceRow label={t('youPayPerVisit')} value={formatMoney(perVisit)} strong />
          {!!b.recurrenceRule && (
            <View style={styles.inline}>
              <Repeat size={14} color={ink[400]} />
              <Text variant="caption" color={colors.textMuted} style={styles.flex}>
                {t('payEachVisit')}
              </Text>
            </View>
          )}
        </Card>
      </Section>

      <ConfirmSheet
        visible={cancelling}
        title={t('cancelTitle')}
        body={t('cancelDescription')}
        confirmLabel={t('cancelBooking')}
        danger
        loading={cancel.isPending}
        onClose={() => setCancelling(false)}
        onConfirm={() => cancel.run(undefined)}>
        <TextField label={ts('label')} value={reason} onChangeText={setReason} placeholder={t('cancelPlaceholder')} maxLength={500} multiline optional hint={ts('counter', { count: reason.length, max: 500 })} />
      </ConfirmSheet>
      <RescheduleSheet bookingId={b.id} visit={moving} visible={!!moving} onClose={() => setMoving(null)} />
      <FileViewerSheet visible={!!viewing} title={t('prescriptionTitle', { patient: b.patient.name })} load={() => bookingsApi.prescriptionUrl(b.id, viewing!.id)} onClose={() => setViewing(null)} />
      <AttachSheet visible={attaching} title={t('prescriptions')} onClose={() => setAttaching(false)} onPick={file => upload.run(file)} />
    </Screen>
  );
}

function PriceRow({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <View style={styles.inline}>
      <Text variant="small" weight={strong ? 'semibold' : 'regular'} color={color ?? (strong ? colors.text : colors.textMuted)} style={styles.flex}>
        {label}
      </Text>
      <Text variant={strong ? 'body' : 'small'} weight={strong ? 'extrabold' : 'semibold'} color={color} tabular numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  mt: { marginTop: space.sm },
  gapSm: { gap: space.sm },
  start: { alignSelf: 'flex-start' },
  dim: { opacity: 0.6 },
  ghostStart: { alignSelf: 'flex-start' },
  dueBanner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.lg, borderRadius: radius.md, backgroundColor: feedback.danger50, borderWidth: 1, borderColor: feedback.danger200, overflow: 'hidden' },
  visitMain: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingStart: space.lg, paddingEnd: space.md, paddingVertical: space.md, minHeight: 72 },
  // Lines up with the text column (date block 60 + gap).
  reschedule: { alignSelf: 'flex-start', marginStart: space.lg + 60 + space.md - space.sm, marginTop: -space.sm, marginBottom: space.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  rx: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rxIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: brand[50], alignItems: 'center', justifyContent: 'center' },
  cg: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
}));
