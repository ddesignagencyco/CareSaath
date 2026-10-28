import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { visitsApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import { BadgeCheck, CalendarDays, Phone, Siren, TriangleAlert } from '../../components/icons';
import { ErrorState, Screen, Section, Skeleton } from '../../components/screen';
import { RichText, Text } from '../../components/Text';
import { Avatar, Button, Card, DirChevron, Divider, ListRow, Touchable } from '../../components/ui';
import { useT } from '../../i18n';
import { useFmt, useLabels } from '../../i18n/format';
import { useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { brand, colors, ink, radius, shadow, space, themed, brandFixed, accentFixed } from '../../theme';
import { ACTIVE_VISIT, Rating, useCaregiver, visitStart, LineIcon } from './components/bits';
import { CalendarClock, NotebookPen, Scale } from './components/icons';
import { ArrivalCodeNotice, ConcernSheet, DisputeItem, DisputeSheet, PaymentPanel, ReviewPanel, RescheduleSheet, SosSheet, useMyDisputes } from './components/panels';
import { VisitTracker, trackIndex } from './components/tracker';

type Dialog = 'sos' | 'concern' | 'dispute' | 'reschedule' | null;

/** FR-C9 / C11 / C12 / C13 / C14, §9.2: track, read the note, rate, change, report, SOS. */
export function VisitDetailScreen({ route, navigation }: CustomerScreen<'VisitDetail'>) {
  const { id } = route.params;
  const t = useT('customerB.visit');
  const tmc = useT('mobileCustomer.visit');
  const ts = useT('shared.sos');
  const tp = useT('customerB.paymentReturn');
  const f = useFmt();
  const L = useLabels();
  const visit = useQuery([...keys.visit, id], () => visitsApi.get(id));
  const v = visit.data;
  const caregiver = useCaregiver(v?.booking.caregiverId);
  const c = caregiver.data;
  const disputes = useMyDisputes();
  const [dialog, setDialog] = useState<Dialog>(null);
  const active = !!v && ACTIVE_VISIT.includes(v.status);

  // Poll faster while the caregiver is on the way or with the patient.
  const { refetch } = visit;
  useEffect(() => {
    const id_ = setInterval(refetch, active ? 10_000 : 30_000);
    return () => clearInterval(id_);
  }, [active, refetch]);

  if (visit.error && !v) {
    return (
      <Screen title={t('back')} back>
        <ErrorState error={visit.error} onRetry={visit.refetch} />
      </Screen>
    );
  }
  if (!v) {
    return (
      <Screen back>
        <Skeleton height={260} />
        <Skeleton height={120} />
      </Screen>
    );
  }

  const canReschedule = (v.status === 'REQUESTED' || v.status === 'CONFIRMED') && visitStart(v.scheduledDate, v.timeWindowStart) > Date.now();
  const visitDisputes = (disputes.data ?? []).filter(d => d.visitId === id);
  const closed = v.status === 'DECLINED' || v.status === 'CANCELLED';

  return (
    <Screen
      back
      title={t('back')}
      refreshing={visit.isFetching && !active}
      onRefresh={visit.refetch}
      footer={active ? <Button label={ts('button')} icon={Siren} variant="danger" size="lg" block onPress={() => setDialog('sos')} /> : undefined}>
      <View style={styles.hero}>
        <Text variant="small" weight="bold" color={accentFixed[200]} numberOfLines={1}>
          {L.visitCustomer(v.status)}
        </Text>
        <Text variant="h2" weight="extrabold" color="#fff" accessibilityRole="header" numberOfLines={1}>
          {f.longDay(v.scheduledDate)}
        </Text>
        {/* Time and service on their own lines, so neither breaks mid-phrase in Urdu. */}
        <Text weight="semibold" color="#fff" numberOfLines={1}>
          {f.timeWindow(v.timeWindowStart, v.timeWindowEnd)}
        </Text>
        <Text variant="small" color={brandFixed[200]} numberOfLines={1}>
          {t('serviceFor', { service: L.specialty(v.booking.serviceType), patient: v.booking.patient.name })}
        </Text>

        <View style={styles.heroTrack}>
          {v.status === 'REQUESTED' ? (
            <Text variant="small" color={brandFixed[100]}>
              {t('waiting')}
            </Text>
          ) : closed ? (
            <Text variant="small" color={brandFixed[100]}>
              {v.booking.cancelReason ? t('closedWithReason', { status: v.status, reason: v.booking.cancelReason }) : t('closed', { status: v.status })}
            </Text>
          ) : trackIndex(v.status) >= 0 ? (
            <VisitTracker visit={v} />
          ) : null}
        </View>

        {/* §9.2: the caregiver's face and name before the visit starts. */}
        {c ? (
          <Touchable onPress={() => navigation.navigate('CaregiverProfile', { id: c.id })} accessibilityRole="button" rippleColor="rgba(255,255,255,0.12)" style={styles.heroCg}>
            <Avatar name={c.user.fullName} uri={c.photoUrl} size={52} />
            <View style={styles.flex}>
              <Text variant="caption" color={brandFixed[200]} numberOfLines={1}>
                {t('yourCaregiver')}
              </Text>
              <Text weight="bold" color="#fff" numberOfLines={1}>
                {c.user.fullName}
              </Text>
            </View>
            <DirChevron color={brandFixed[200]} />
          </Touchable>
        ) : caregiver.error ? (
          <Text variant="small" color={brandFixed[200]}>
            {t('caregiverUnavailable')}
          </Text>
        ) : null}
      </View>

      {c && !closed && v.status !== 'COMPLETED' && (
        <View style={styles.checkId}>
          <LineIcon icon={BadgeCheck} color={brand[700]} />
          <View style={styles.flex}>
            <RichText variant="small" color={brand[800]}>
              {tmc.raw('checkId', { name: c.user.fullName, body: L.licenseBody(c.licenseBody) })}
            </RichText>
            <View style={styles.mt}>
              <Rating average={c.ratingAverage} count={c.ratingCount} />
            </View>
          </View>
        </View>
      )}

      {(v.status === 'CONFIRMED' || v.status === 'EN_ROUTE') && <ArrivalCodeNotice phone={v.booking.customer.phone} />}

      <PaymentPanel visit={v} />

      {v.note && (
        <Section title={t('noteTitle')}>
          <Text variant="caption" color={colors.textMuted}>
            {t('noteBy', { date: f.dateTime(v.note.submittedAt) })}
          </Text>
          <Card style={styles.note}>
            <LineIcon icon={NotebookPen} color={brand[600]} variant="body" />
            <Text style={styles.flex}>{v.note.summary}</Text>
          </Card>
        </Section>
      )}

      {(v.status === 'COMPLETED' || v.review) && (
        <Card>
          <ReviewPanel visit={v} caregiverName={c?.user.fullName ?? t('yourCaregiverLower')} />
        </Card>
      )}

      {visitDisputes.length > 0 && (
        <Section title={t('disputesTitle')}>
          {visitDisputes.map(d => (
            <DisputeItem key={d.id} d={d} userId={v.booking.customerId} />
          ))}
        </Section>
      )}

      {v.statusHistory.length > 0 && (
        <Section title={t('updates')}>
          <Card style={styles.timeline}>
            {[...v.statusHistory].reverse().map((h, i) => (
              <View key={h.id} style={styles.tlRow}>
                <View style={styles.tlRail}>
                  <View style={[styles.tlDot, i === 0 && styles.tlDotNow]} />
                  {i < v.statusHistory.length - 1 && <View style={styles.tlLine} />}
                </View>
                <View style={styles.tlBody}>
                  <Text variant="small" weight="semibold">
                    {L.visitCustomer(h.toStatus)}
                  </Text>
                  <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
                    {f.dateTime(h.at)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </Section>
      )}

      <Card padded={false}>
        {canReschedule && (
          <>
            <ListRow icon={CalendarClock} title={t('rescheduleThis')} onPress={() => setDialog('reschedule')} />
            <Divider inset={space.lg} />
          </>
        )}
        <ListRow icon={Phone} title={t('call1122')} danger chevron={false} onPress={() => Linking.openURL('tel:1122').catch(() => {})} />
        <Divider inset={space.lg} />
        <ListRow icon={TriangleAlert} title={t('reportConcern')} onPress={() => setDialog('concern')} />
        <Divider inset={space.lg} />
        <ListRow icon={Scale} title={t('raiseDispute')} onPress={() => setDialog('dispute')} />
        <Divider inset={space.lg} />
        <ListRow icon={CalendarDays} title={tp('viewBooking')} onPress={() => navigation.navigate('BookingDetail', { id: v.bookingId })} />
      </Card>

      <SosSheet visitId={v.id} description={t('sosDescription')} visible={dialog === 'sos'} onClose={() => setDialog(null)} />
      <ConcernSheet visitId={v.id} visible={dialog === 'concern'} onClose={() => setDialog(null)} />
      <DisputeSheet visitId={v.id} visible={dialog === 'dispute'} onClose={() => setDialog(null)} />
      <RescheduleSheet
        bookingId={v.bookingId}
        visit={dialog === 'reschedule' ? v : null}
        visible={dialog === 'reschedule'}
        onClose={() => setDialog(null)}
        // The old visit is now cancelled; follow the booking to its replacement.
        onMoved={next => navigation.replace('VisitDetail', { id: next.id })}
      />
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  mt: { marginTop: 6 },
  hero: { backgroundColor: brand[900], borderRadius: radius.xl, padding: space.xl, gap: space.xs, ...shadow.pop },
  heroTrack: { marginTop: space.lg, marginBottom: space.sm },
  heroCg: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  checkId: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: brand[50], borderWidth: 1, borderColor: brand[100] },
  note: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  timeline: { gap: 0 },
  tlRow: { flexDirection: 'row', gap: space.md },
  tlRail: { width: 14, alignItems: 'center' },
  tlDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: brand[300], marginTop: 5 },
  tlDotNow: { backgroundColor: brand[600] },
  tlLine: { flex: 1, width: 2, backgroundColor: ink[100], marginVertical: 2 },
  tlBody: { flex: 1, paddingBottom: space.md },
}));
