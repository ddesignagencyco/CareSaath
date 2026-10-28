import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { bookingsApi, visitsApi } from '../../api/caregiver/api';
import type { PrescriptionDocument } from '../../api/types';
import { ClipboardList, Clock, FileText, HeartPulse, ListChecks, MapPin, Phone, Siren, TriangleAlert, User } from '../../components/icons';
import { ErrorState, Screen, SkeletonList } from '../../components/screen';
import { RichText, Text } from '../../components/Text';
import { Avatar, Badge, Button, Card, DateBlock, Divider, ListRow, Touchable, BUTTON_HEIGHT } from '../../components/ui';
import { useT } from '../../i18n';
import { formatBytes, useFmt, useLabels } from '../../i18n/format';
import { useQuery } from '../../lib/query';
import type { CaregiverScreen } from '../../navigation/types';
import { brand, colors, feedback, ink, radius, shadow, space, themed } from '../../theme';
import { DetailRow, Panel } from './components/Bits';
import { FileRow, FileViewer } from './components/Files';
import { ACTIVE_STATUSES, callPhone, dateBlockLabel, openMaps, readableMedical, VISIT_TONE } from './components/helpers';
import { MapPinned, Scale } from './components/icons';
import { MessageButton } from '../shared/chat/MessageButton';
import { CashCard, DisputeSheet, ReportSheet, SosSheet } from './components/Safety';
import { VisitFlow, visitKey } from './components/VisitFlow';

const LIVE: string[] = ['EN_ROUTE', 'CHECKED_IN', 'IN_PROGRESS', 'CONFIRMED'];

export function CgVisitDetailScreen({ route, navigation }: CaregiverScreen<'CgVisitDetail'>) {
  const { id } = route.params;
  const t = useT('caregiverB.visit');
  const ts = useT('shared.sos');
  const tchat = useT('mobile.chat');
  const f = useFmt();
  const L = useLabels();
  const visit = useQuery(visitKey(id), () => visitsApi.get(id));
  const [rx, setRx] = useState<PrescriptionDocument | null>(null);
  const [sheet, setSheet] = useState<'sos' | 'report' | 'dispute' | null>(null);

  const v = visit.data;
  const { refetch } = visit;
  // Poll so a family's reschedule/cancel shows up; faster while the visit is live.
  const fast = !!v && LIVE.includes(v.status);
  useEffect(() => {
    const timer = setInterval(refetch, fast ? 15_000 : 30_000);
    return () => clearInterval(timer);
  }, [refetch, fast]);

  if (visit.error) {
    return (
      <Screen title={t('back')} back>
        <ErrorState error={visit.error} onRetry={refetch} />
      </Screen>
    );
  }
  if (!v) {
    return (
      <Screen title={t('back')} back>
        <SkeletonList count={3} height={160} />
      </Screen>
    );
  }

  const active = ACTIVE_STATUSES.includes(v.status);
  const booking = v.booking;
  const patient = booking.patient;
  const address = booking.address;
  const customer = booking.customer;
  const medical = readableMedical(patient?.medicalContext);
  const patientName = patient?.name ?? t('patient');

  return (
    <Screen title={patientName} back refreshing={visit.isFetching} onRefresh={refetch}>
      <View style={styles.summary}>
        <DateBlock day={Number(v.scheduledDate.slice(8, 10))} label={dateBlockLabel(f, v.scheduledDate)} highlight={active} />
        <View style={styles.flex}>
          <Text weight="bold" numberOfLines={1}>
            {f.longDay(v.scheduledDate)}
          </Text>
          <View style={styles.inline}>
            <Clock size={14} color={brand[600]} />
            <Text variant="small" weight="semibold" color={brand[800]} numberOfLines={1} style={[styles.shrink, styles.ltr]}>
              {f.timeWindow(v.timeWindowStart, v.timeWindowEnd)}
            </Text>
          </View>
          <View style={styles.badgeRow}>
            <Badge tone={VISIT_TONE[v.status]} label={L.visitCaregiver(v.status)} />
            <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
              {L.specialty(booking.serviceType)}
            </Text>
          </View>
        </View>
      </View>

      {active && (
        <Touchable onPress={() => setSheet('sos')} accessibilityRole="button" accessibilityLabel={ts('button')} rippleColor="rgba(220,38,38,0.15)" style={styles.sos}>
          <Siren size={22} color={feedback.danger700} />
          <Text weight="extrabold" color={feedback.danger700}>
            {ts('button')}
          </Text>
        </Touchable>
      )}

      {v.status === 'DECLINED' || v.status === 'CANCELLED' ? (
        <Card>
          <Text color={ink[600]}>
            {booking.cancelReason ? t('closedWithReason', { status: v.status, reason: booking.cancelReason }) : t('closed', { status: v.status })}
          </Text>
        </Card>
      ) : v.status === 'REQUESTED' ? (
        <Card style={styles.gapSm}>
          <Text color={ink[600]}>{t('awaitingResponse')}</Text>
          <Button label={t('goToRequests')} variant="secondary" onPress={() => navigation.navigate('CaregiverTabs', { screen: 'Requests' })} />
        </Card>
      ) : (
        <Card style={styles.flowCard}>
          <VisitFlow visit={v} />
        </Card>
      )}

      <CashCard visit={v} />

      <Panel icon={User} tone="teal" title={t('patient')}>
        <View style={styles.person}>
          <Avatar name={patientName} />
          <View style={styles.flex}>
            <Text weight="bold" numberOfLines={1}>
              {patientName}
            </Text>
            {!!patient && (
              <Text variant="small" color={colors.textMuted}>
                {L.patientLine(patient, f.age(patient.dateOfBirth))}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.medical}>
          <View style={styles.inline}>
            <HeartPulse size={16} color={brand[800]} />
            <Text variant="small" weight="bold" color={brand[800]}>
              {t('medicalContext')}
            </Text>
          </View>
          <Text variant="small" color={medical === 'unreadable' ? colors.textMuted : ink[800]}>
            {medical === 'unreadable' ? t('medicalUnavailable') : medical || t('noMedical')}
          </Text>
        </View>
      </Panel>

      <Panel icon={FileText} tone="marigold" title={t('prescriptions')}>
        {booking.prescriptions.length === 0 ? (
          <Text variant="small" color={colors.textMuted}>
            {t('noPrescriptions')}
          </Text>
        ) : (
          booking.prescriptions.map(p => (
            <FileRow
              key={p.id}
              title={t('prescription')}
              image={p.mimeType?.startsWith('image/')}
              meta={`${(p.mimeType?.split('/')[1] ?? '').toUpperCase()} · ${formatBytes(p.sizeBytes)} · ${f.dateTime(p.createdAt)}`}
              onPress={() => setRx(p)}
            />
          ))
        )}
      </Panel>

      <Panel icon={MapPin} tone="mint" title={t('locationFamily')}>
        <View style={styles.inlineTop}>
          <View style={styles.flex}>
            {!!address.label && (
              <Text variant="caption" weight="semibold" color={colors.textMuted} numberOfLines={1}>
                {address.label}
              </Text>
            )}
            <Text weight="semibold">{address.addressLine}</Text>
            <Text variant="small" color={colors.textMuted}>
              {address.city}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Button label={t('directions')} icon={MapPinned} variant="secondary" style={styles.flex} onPress={() => openMaps(address)} />
          {!!customer?.phone && <Button label={t('callFamily')} icon={Phone} variant="secondary" style={styles.flex} onPress={() => callPhone(customer.phone)} />}
        </View>
        {!!customer && <MessageButton peer={{ id: customer.id, name: customer.fullName, role: 'FAMILY' }} label={tchat('messageFamily')} />}
        {!!customer && (
          <RichText variant="small" color={ink[600]} boldColor={ink[900]}>
            {`${customer.fullName ? t.raw('bookedBy', { name: customer.fullName }) : t('bookedByUnnamed')}${customer.phone ? ` · ${f.phone(customer.phone)}` : ''}`}
          </RichText>
        )}
      </Panel>

      <Panel icon={ClipboardList} tone="sand" title={t('booking')}>
        <DetailRow label={t('service')} value={L.specialty(booking.serviceType)} />
        <DetailRow
          label={t('type')}
          value={booking.recurrenceRule?.weekdays?.length ? t('recurring', { days: f.weekdays(booking.recurrenceRule.weekdays) }) : t('singleVisit')}
        />
      </Panel>

      {v.statusHistory.length > 0 && (
        <Panel icon={ListChecks} tone="ink" title={t('timeline')}>
          {v.statusHistory.map((h, i) => (
            <View key={h.id} style={styles.tlRow}>
              <View style={styles.tlRail}>
                <View style={styles.tlDot} />
                {i < v.statusHistory.length - 1 && <View style={styles.tlLine} />}
              </View>
              <View style={styles.tlBody}>
                <Text variant="small" weight="semibold">
                  {L.timeline(h.toStatus)}
                </Text>
                <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {f.dateTime(h.at)}
                </Text>
              </View>
            </View>
          ))}
        </Panel>
      )}

      <Card padded={false} style={styles.clip}>
        <ListRow icon={TriangleAlert} title={t('reportIssue')} onPress={() => setSheet('report')} />
        <Divider inset={space.lg} />
        <ListRow icon={Scale} title={t('raiseDispute')} onPress={() => setSheet('dispute')} />
      </Card>

      <FileViewer visible={!!rx} title={t('prescriptionTitle', { name: patientName })} load={() => bookingsApi.prescriptionUrl(v.bookingId, rx!.id)} onClose={() => setRx(null)} />
      <SosSheet visible={sheet === 'sos'} visit={v} onClose={() => setSheet(null)} />
      <ReportSheet visible={sheet === 'report'} visitId={v.id} onClose={() => setSheet(null)} />
      <DisputeSheet visible={sheet === 'dispute'} visitId={v.id} onClose={() => setSheet(null)} />
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  ltr: { writingDirection: 'ltr' },
  gapSm: { gap: space.md },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ink[100],
    ...shadow.card,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: 4 },
  flowCard: { borderColor: brand[200], borderWidth: 1.5 },
  clip: { overflow: 'hidden' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  sos: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: BUTTON_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: feedback.danger600,
    backgroundColor: feedback.danger50,
    overflow: 'hidden',
  },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  medical: { gap: 6, backgroundColor: brand[50], borderRadius: radius.md, borderWidth: 1, borderColor: brand[100], padding: space.md },
  actions: { flexDirection: 'row', gap: space.sm },
  tlRow: { flexDirection: 'row', gap: space.md },
  tlRail: { alignItems: 'center', paddingTop: 5 },
  tlDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: brand[500], borderWidth: 2, borderColor: colors.ring },
  tlLine: { width: 2, flex: 1, backgroundColor: ink[100], marginTop: 2 },
  tlBody: { flex: 1, paddingBottom: space.md },
}));
