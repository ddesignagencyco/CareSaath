import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { disputesApi, paymentsApi, safetyApi } from '../../../api/caregiver/api';
import { keys } from '../../../api/caregiver/keys';
import type { CaregiverVisitDetail, IncidentPriority, SosResult } from '../../../api/types';
import { TextField } from '../../../components/form';
import { Banknote, Check, Download, Phone, Siren } from '../../../components/icons';
import { USE_MOCKS } from '../../../api/config';
import { ConfirmSheet, Sheet, useToast } from '../../../components/overlay';
import { Text } from '../../../components/Text';
import { Button, Touchable } from '../../../components/ui';
import { useT } from '../../../i18n';
import { useFmt, useLabels } from '../../../i18n/format';
import { formatPkMobile } from '../../../lib/phone';
import { useAction } from '../../../lib/query';
import { brand, colors, feedback, ink, radius, space, themed } from '../../../theme';
import { Panel } from './Bits';
import { callPhone } from './helpers';
import { coord, getDeviceLocation } from '../../../lib/location';

const EMERGENCY = [
  { key: 'rescue', number: '1122' },
  { key: 'police', number: '15' },
  { key: 'edhi', number: '115' },
] as const;

/** One-tap emergency calls; the family (or other contact) as an extra tile. */
function CallGrid({ contact }: { contact?: { label: string; phone: string } }) {
  const t = useT('shared.sos');
  return (
    <View style={styles.gapSm}>
      <Text variant="small" weight="bold" color={ink[600]}>
        {t('callDirectly')}
      </Text>
      <View style={styles.grid}>
        {EMERGENCY.map(e => (
          <Touchable key={e.number} onPress={() => callPhone(e.number)} accessibilityRole="button" accessibilityLabel={t(e.key)} style={styles.callTile}>
            <Phone size={18} color={feedback.danger600} />
            <View style={styles.flex}>
              <Text variant="small" weight="bold" numberOfLines={1}>
                {t(e.key)}
              </Text>
              <Text variant="caption" color={colors.textMuted}>
                {t(`${e.key}Note`)}
              </Text>
            </View>
          </Touchable>
        ))}
        {contact && (
          <Touchable onPress={() => callPhone(contact.phone)} accessibilityRole="button" accessibilityLabel={contact.label} style={styles.callTile}>
            <Phone size={18} color={brand[600]} />
            <View style={styles.flex}>
              <Text variant="small" weight="bold" numberOfLines={1}>
                {contact.label}
              </Text>
              <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.ltr}>
                {formatPkMobile(contact.phone)}
              </Text>
            </View>
          </Touchable>
        )}
      </View>
    </View>
  );
}

/** SOS during an active visit (POST /sos) — sending fast beats detail. */
export function SosSheet({ visible, visit, onClose }: { visible: boolean; visit: CaregiverVisitDetail; onClose: () => void }) {
  const t = useT('shared.sos');
  const ts = useT('caregiverB.safety');
  const tc = useT('common.actions');
  const toast = useToast();
  const [note, setNote] = useState('');
  const [result, setResult] = useState<SosResult | null>(null);
  const [sending, setSending] = useState(false);
  const address = visit.booking.address;

  async function send() {
    setSending(true);
    try {
      // No geolocation module yet: the patient's address stands in for the device location.
      // Phone position if it arrives within 4 s; otherwise the visit address. Never delay an SOS for GPS.
      const here = await Promise.race([
        getDeviceLocation().then(p => ({ latitude: coord(p.lat), longitude: coord(p.lng) })),
        new Promise<null>(r => setTimeout(() => r(null), 4000)),
      ]).catch(() => null);
      const at = here ?? { latitude: address.latitude, longitude: address.longitude };
      setResult(await safetyApi.sos({ visitId: visit.id, note: note.trim() || undefined, ...at }));
    } catch {
      toast.error(t('failed'));
    } finally {
      setSending(false);
    }
  }

  const close = () => {
    onClose();
    setResult(null);
    setNote('');
  };
  const contact = visit.booking.customer?.phone ? { label: ts('family'), phone: visit.booking.customer.phone } : undefined;

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={result ? t('sentTitle') : t('title')}
      footer={
        result ? (
          <Button label={tc('done')} block onPress={close} />
        ) : (
          <View style={styles.gapSm}>
            <Button label={t('send')} icon={Siren} variant="danger" size="lg" block loading={sending} onPress={send} />
            <Button label={tc('cancel')} variant="secondary" block onPress={close} />
          </View>
        )
      }>
      {result ? (
        <View style={styles.sent}>
          <Text weight="semibold" color={feedback.danger700}>
            {t('result', { admins: result.notifiedAdmins, contacts: result.notifiedContacts })}
          </Text>
        </View>
      ) : (
        <>
          <Text color={colors.textMuted}>{ts('sosDescription')}</Text>
          <TextField label={t('whatsHappening')} hint={t('hint')} placeholder={t('placeholder')} value={note} onChangeText={setNote} multiline maxLength={2000} />
        </>
      )}
      <CallGrid contact={contact} />
    </Sheet>
  );
}

const PRIORITIES: IncidentPriority[] = ['LOW', 'MEDIUM', 'HIGH'];

/** FR-CG10: safety or access problem at the patient's home, straight to admin. */
export function ReportSheet({ visible, visitId, onClose }: { visible: boolean; visitId: string; onClose: () => void }) {
  const t = useT('caregiverB.safety');
  const tc = useT('common.actions');
  const L = useLabels();
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<IncidentPriority>('MEDIUM');
  const report = useAction(() => safetyApi.report({ visitId, description: description.trim(), priority }), {
    invalidate: [keys.safety],
    success: t('reportSent'),
    onSuccess: () => {
      setDescription('');
      onClose();
    },
  });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('reportTitle')}
      footer={
        <View style={styles.gapSm}>
          <Button label={t('sendReport')} variant="danger" block size="lg" loading={report.isPending} disabled={description.trim().length < 3} onPress={() => report.run(undefined)} />
          <Button label={tc('cancel')} variant="secondary" block onPress={onClose} />
        </View>
      }>
      <Text color={colors.textMuted}>{t('reportDescription')}</Text>
      <Text variant="small" weight="semibold" color={ink[700]}>
        {t('howSerious')}
      </Text>
      {PRIORITIES.map(p => {
        const on = p === priority;
        return (
          <Touchable key={p} onPress={() => setPriority(p)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.option, on && styles.optionOn]}>
            <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
            <View style={styles.flex}>
              <Text weight="bold" color={on ? brand[800] : colors.text}>
                {L.priority(p)}
              </Text>
              <Text variant="small" color={colors.textMuted}>
                {t(`priorityHint.${p}`)}
              </Text>
            </View>
          </Touchable>
        );
      })}
      <TextField label={t('whatHappened')} hint={`${description.length}/4000`} value={description} onChangeText={setDescription} multiline maxLength={4000} />
    </Sheet>
  );
}

export function DisputeSheet({ visible, visitId, onClose }: { visible: boolean; visitId: string; onClose: () => void }) {
  const t = useT('caregiverB.safety');
  const tc = useT('common.actions');
  const [description, setDescription] = useState('');
  const raise = useAction(() => disputesApi.raise({ visitId, description: description.trim() }), {
    invalidate: [keys.disputes],
    success: t('disputeRaised'),
    onSuccess: () => {
      setDescription('');
      onClose();
    },
  });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('disputeTitle')}
      footer={
        <View style={styles.gapSm}>
          <Button label={t('raiseDispute')} block size="lg" loading={raise.isPending} disabled={description.trim().length < 5} onPress={() => raise.run(undefined)} />
          <Button label={tc('cancel')} variant="secondary" block onPress={onClose} />
        </View>
      }>
      <Text color={colors.textMuted}>{t('disputeDescription')}</Text>
      <TextField label={t('describeProblem')} hint={t('disputeHint', { count: description.length })} value={description} onChangeText={setDescription} multiline maxLength={4000} />
    </Sheet>
  );
}

const CASH_STATUSES: CaregiverVisitDetail['status'][] = ['CHECKED_IN', 'IN_PROGRESS', 'CHECKED_OUT', 'COMPLETED'];

/**
 * "Confirm cash received". Cash turns PAID only once the family confirms
 * handing it over as well; until then the visit can't be completed.
 */
export function CashCard({ visit }: { visit: CaregiverVisitDetail }) {
  const t = useT('caregiverB.cash');
  const tm = useT('mobileCaregiver.cash');
  const f = useFmt();
  const [confirming, setConfirming] = useState(false);
  const payment = visit.payments?.find(p => p.method === 'CASH' && (p.status === 'PENDING' || p.status === 'PAID'));
  const receipt = useAction(() => paymentsApi.openReceipt(payment!.id), { success: null });
  const confirm = useAction(() => paymentsApi.confirmCash(payment!.id), {
    invalidate: [['cg-visit', visit.id], keys.earnings],
    success: t('confirmedToast'),
    onSuccess: () => setConfirming(false),
  });
  if (!payment || !CASH_STATUSES.includes(visit.status)) return null;
  return (
    <Panel title={t('title')}>
      <View style={styles.cashRow}>
        <Banknote size={20} color={ink[400]} />
        <Text color={ink[600]} style={styles.flex}>
          {t('amountLabel')}
        </Text>
        <Text variant="title" weight="extrabold" numeric tabular numberOfLines={1} style={styles.shrink}>
          {f.money(payment.amount)}
        </Text>
      </View>
      {payment.status === 'PAID' ? (
        <View style={styles.paid}>
          <Check size={18} color={feedback.success700} />
          <Text variant="small" weight="semibold" color={feedback.success700} style={styles.flex}>
            {payment.paidAt ? t('receivedAt', { time: f.dateTime(payment.paidAt) }) : t('received')}
          </Text>
          {!USE_MOCKS && <Button label={t('receipt')} icon={Download} variant="ghost" loading={receipt.isPending} onPress={() => receipt.run(undefined)} />}
        </View>
      ) : payment.caregiverConfirmedAt ? (
        <Text variant="small" color={colors.textMuted}>
          {tm('waitingFamily')}
        </Text>
      ) : (
        <>
          <Text variant="small" color={colors.textMuted}>
            {t('pendingHint')}
          </Text>
          <Button label={t('confirm')} icon={Banknote} variant="success" block onPress={() => setConfirming(true)} />
        </>
      )}
      <ConfirmSheet
        visible={confirming}
        title={t('confirmTitle')}
        body={t('confirmDescription', { amount: f.money(payment.amount) })}
        confirmLabel={t('confirmYes')}
        success
        loading={confirm.isPending}
        onConfirm={() => confirm.run(undefined)}
        onClose={() => setConfirming(false)}>
        <Text variant="small" color={colors.textMuted}>
          {t('confirmNote')}
        </Text>
      </ConfirmSheet>
    </Panel>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  ltr: { writingDirection: 'ltr' },
  gapSm: { gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  callTile: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    minHeight: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: ink[200],
    overflow: 'hidden',
  },
  sent: { backgroundColor: feedback.danger50, borderRadius: radius.md, padding: space.lg },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: ink[200], minHeight: 60, overflow: 'hidden' },
  optionOn: { borderColor: brand[500], backgroundColor: brand[50] },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: ink[300], alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: brand[600] },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: brand[600] },
  cashRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  paid: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: feedback.success50, borderRadius: radius.md, padding: space.md },
}));
