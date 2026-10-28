import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { bookingsApi, disputesApi, paymentsApi, visitsApi } from '../../../api/customer/api';
import { keys } from '../../../api/customer/keys';
import type { CustomerVisitDetail, DisputeRow, IncidentPriority, PaymentMethod, SosResult, Visit } from '../../../api/types';
import { Select, TextField } from '../../../components/form';
import { Banknote, Check, CreditCard, Phone, Siren, Smartphone, Star, type IconType } from '../../../components/icons';
import { ConfirmSheet, Sheet, useToast } from '../../../components/overlay';
import { Text } from '../../../components/Text';
import { Badge, Button, Touchable } from '../../../components/ui';
import { useT } from '../../../i18n';
import { formatMoney, useFmt, useLabels } from '../../../i18n/format';
import { useAction, useQuery } from '../../../lib/query';
import { accent, brand, colors, feedback, ink, radius, space, themed } from '../../../theme';
import { Banner, nowHHmm, todayKey } from './bits';
import { DateStrip, TimeWindowPicker, nextSlot, windowFrom } from './dates';
import { KeyRound } from './icons';
import { formatPkMobile } from '../../../lib/phone';

/* ---- Arrival code --------------------------------------------------------- */

export function ArrivalCodeNotice({ phone }: { phone: string }) {
  const t = useT('customerB.arrivalCode');
  const text = t('notice', { phone: formatPkMobile(phone) });
  return (
    <Banner icon={KeyRound}>
      <Text variant="small" color={brand[800]}>
        {text}
      </Text>
    </Banner>
  );
}

/* ---- Payment -------------------------------------------------------------- */

/** JazzCash / Easypaisa stay disabled until their gateway lands (same as web). */
const METHODS: { value: PaymentMethod; icon: IconType; available: boolean }[] = [
  { value: 'CASH', icon: Banknote, available: true },
  { value: 'CARD', icon: CreditCard, available: true },
  { value: 'JAZZCASH', icon: Smartphone, available: false },
  { value: 'EASYPAISA', icon: Smartphone, available: false },
];

/** Stripe refuses charges below ~US$0.50; the backend enforces PKR 140. */
const STRIPE_MIN_PAISA = 14_000;

export function usePayments() {
  return useQuery([...keys.payments, 'list'], () => paymentsApi.list({ limit: 100 }));
}

export function PaymentPanel({ visit }: { visit: CustomerVisitDetail }) {
  const t = useT('customerB.payment');
  const tm = useT('mobileCustomer.payment');
  const L = useLabels();
  const f = useFmt();
  const toast = useToast();
  const payments = usePayments();
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [open, setOpen] = useState(false);
  const [confirmingCash, setConfirmingCash] = useState(false);
  const amount = visit.booking.rateSnapshot - visit.booking.discountAmount;
  const payable = (visit.booking.status === 'CONFIRMED' || visit.booking.status === 'COMPLETED') && visit.status !== 'CANCELLED' && visit.status !== 'DECLINED';
  const existing = payments.data?.items.find(p => p.visitId === visit.id && (p.status === 'PAID' || p.status === 'PENDING'));
  const methodLabel = (m: PaymentMethod) => (m === 'CASH' ? t('methodCash') : m === 'CARD' ? t('methodCard') : L.paymentMethod(m));
  const methodHint = (m: PaymentMethod) => (m === 'CASH' ? t('methodCashHint') : m === 'CARD' ? t('methodCardHint') : t('methodWalletHint'));

  const pay = useAction(() => paymentsApi.initiate({ visitId: visit.id, method }), {
    invalidate: [keys.payments],
    onSuccess: res => {
      setOpen(false);
      if ('checkoutUrl' in res) {
        toast.success(t('redirecting'));
        Linking.openURL(res.checkoutUrl).catch(() => {});
        return;
      }
      toast.success(res.status === 'PAID' ? t('paidToast', { amount: formatMoney(res.amount) }) : res.method === 'CASH' ? t('cashToast') : t('pendingToast'));
    },
  });
  const abandon = useAction(() => paymentsApi.cancel(existing?.id ?? ''), { invalidate: [keys.payments], success: t('abandoned') });
  // Cash closes only when both sides confirm: the family here, the caregiver in their app.
  const confirmCash = useAction(() => paymentsApi.confirmCash(existing?.id ?? ''), {
    invalidate: [keys.payments, keys.visit],
    success: tm('cashConfirmedToast'),
    onSuccess: () => setConfirmingCash(false),
  });
  const cashPending = existing?.status === 'PENDING' && existing.method === 'CASH';

  if (!payable && !existing) return null;

  return (
    <View style={styles.payBox}>
      <View style={styles.payRow}>
        <View style={styles.flex}>
          <Text variant="small" color={colors.textMuted}>
            {t('title')}
          </Text>
          <Text variant="title" weight="extrabold" tabular numberOfLines={1}>
            {formatMoney(existing?.amount ?? amount)}
          </Text>
        </View>
        {payments.isLoading ? null : existing ? (
          existing.status === 'PAID' ? (
            <Badge tone="success" label={t('paidWith', { method: L.paymentMethod(existing.method) })} />
          ) : (
            <Badge tone="accent" label={existing.method === 'CASH' ? t('cashDue') : t('awaitingGateway', { method: L.paymentMethod(existing.method) })} />
          )
        ) : (
          <Button label={t('payNow')} onPress={() => setOpen(true)} />
        )}
      </View>
      {cashPending &&
        (existing.customerConfirmedAt ? (
          <Text variant="small" color={colors.textMuted}>
            {tm('waitingCaregiver')}
          </Text>
        ) : (
          <>
            <Text variant="small" color={colors.textMuted}>
              {tm('cashHint')}
            </Text>
            <Button label={tm('confirmCash')} icon={Banknote} variant="success" block onPress={() => setConfirmingCash(true)} />
          </>
        ))}
      {existing?.status === 'PENDING' && existing.method !== 'CASH' && (
        <Button label={t('payAnotherWay')} variant="ghost" loading={abandon.isPending} onPress={() => abandon.run(undefined)} />
      )}
      {existing?.status === 'PAID' && !!existing.paidAt && (
        <Text variant="caption" color={colors.textMuted}>
          {t('paidAt', { date: f.dateTime(existing.paidAt) })}
        </Text>
      )}

      <ConfirmSheet
        visible={confirmingCash}
        title={tm('confirmCashTitle')}
        body={tm('confirmCashBody', { amount: formatMoney(existing?.amount ?? amount) })}
        confirmLabel={tm('confirmCashYes')}
        success
        loading={confirmCash.isPending}
        onConfirm={() => confirmCash.run(undefined)}
        onClose={() => setConfirmingCash(false)}>
        <Text variant="small" color={colors.textMuted}>
          {tm('confirmCashNote')}
        </Text>
      </ConfirmSheet>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('modalTitle')}
        footer={<Button label={method === 'CASH' ? t('payCash') : t('payAmount', { amount: formatMoney(amount) })} size="lg" block loading={pay.isPending} onPress={() => pay.run(undefined)} />}>
        <Text variant="h2" weight="extrabold" tabular numberOfLines={1}>
          {formatMoney(amount)}
        </Text>
        {METHODS.map(({ value, icon: Icon, available }) => {
          const belowMin = value === 'CARD' && amount < STRIPE_MIN_PAISA;
          const ok = available && !belowMin;
          const on = method === value;
          return (
            <Touchable
              key={value}
              disabled={!ok}
              onPress={() => setMethod(value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: !ok }}
              style={[styles.method, on ? styles.methodOn : styles.methodOff, !ok && styles.disabled]}>
              <View style={styles.methodIcon}>
                <Icon size={20} color={brand[600]} />
              </View>
              <View style={styles.flex}>
                <Text weight="bold" numberOfLines={1}>
                  {methodLabel(value)}
                </Text>
                <Text variant="small" color={colors.textMuted}>
                  {ok ? methodHint(value) : belowMin ? t('cardMinimum', { amount: formatMoney(STRIPE_MIN_PAISA) }) : t('comingSoon')}
                </Text>
              </View>
              <View style={[styles.radio, on && styles.radioOn]} />
            </Touchable>
          );
        })}
        <Text variant="caption" color={colors.textMuted}>
          {t('gatewayNote')}
        </Text>
      </Sheet>
    </View>
  );
}

/* ---- Review ----------------------------------------------------------------- */

export function ReviewPanel({ visit, caregiverName }: { visit: CustomerVisitDetail; caregiverName: string }) {
  const t = useT('customerB.review');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const submit = useAction(() => visitsApi.review(visit.id, { rating, comment: comment.trim() || undefined }), {
    invalidate: [keys.visit, keys.caregivers],
    success: t('success'),
  });

  if (visit.review) {
    return (
      <View style={styles.reviewDone}>
        <Text variant="small" weight="semibold" color={colors.textMuted}>
          {t('yours')}
        </Text>
        <View style={styles.starsRow} accessible accessibilityLabel={t('outOf5', { rating: visit.review.rating })}>
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={22} color={i < visit.review!.rating ? accent[500] : ink[200]} fill={i < visit.review!.rating ? accent[500] : 'none'} />
          ))}
        </View>
        {!!visit.review.comment && <Text variant="small">“{visit.review.comment}”</Text>}
      </View>
    );
  }
  if (visit.status !== 'COMPLETED') return null;

  return (
    <View style={styles.gap}>
      <Text variant="lead" weight="bold">
        {t('question', { name: caregiverName.split(' ')[0] })}
      </Text>
      <View style={styles.starsRow} accessibilityRole="radiogroup" accessibilityLabel={t('rating')}>
        {[1, 2, 3, 4, 5].map(n => (
          <Touchable key={n} onPress={() => setRating(n)} accessibilityRole="radio" accessibilityState={{ selected: rating === n }} accessibilityLabel={t('stars', { n })} style={styles.starBtn}>
            <Star size={34} color={n <= rating ? accent[500] : ink[300]} fill={n <= rating ? accent[500] : 'none'} />
          </Touchable>
        ))}
      </View>
      <TextField label={t('comment')} value={comment} onChangeText={setComment} maxLength={2000} multiline placeholder={t('placeholder')} optional />
      <Button label={t('submit')} disabled={rating === 0} loading={submit.isPending} onPress={() => submit.run(undefined)} />
    </View>
  );
}

/* ---- Concern / dispute ------------------------------------------------------ */

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const satisfies readonly IncidentPriority[];

export function ConcernSheet({ visitId, visible, onClose }: { visitId: string; visible: boolean; onClose: () => void }) {
  const t = useT('customerB.concern');
  const L = useLabels();
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<IncidentPriority>('MEDIUM');
  const report = useAction(() => visitsApi.report(visitId, { description: description.trim(), priority }), {
    invalidate: [keys.visit],
    success: t('success'),
    onSuccess: () => {
      setDescription('');
      onClose();
    },
  });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('title')}
      footer={<Button label={t('send')} variant="danger" size="lg" block loading={report.isPending} disabled={description.trim().length < 3} onPress={() => report.run(undefined)} />}>
      <Text color={colors.textMuted}>{t('description')}</Text>
      <Select
        label={t('severity')}
        value={priority}
        onChange={setPriority}
        options={PRIORITIES.map(value => ({ value, label: L.priority(value), description: t(`priorityHint.${value}`) }))}
      />
      <TextField label={t('whatHappened')} value={description} onChangeText={setDescription} maxLength={4000} multiline hint={`${description.length}/4000`} />
    </Sheet>
  );
}

export function DisputeSheet({ visitId, visible, onClose }: { visitId: string; visible: boolean; onClose: () => void }) {
  const t = useT('customerB.dispute');
  const [description, setDescription] = useState('');
  const raise = useAction(() => disputesApi.raise({ visitId, description: description.trim() }), {
    invalidate: [keys.disputes],
    success: t('success'),
    onSuccess: () => {
      setDescription('');
      onClose();
    },
  });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('title')}
      footer={<Button label={t('submit')} size="lg" block loading={raise.isPending} disabled={description.trim().length < 5} onPress={() => raise.run(undefined)} />}>
      <Text color={colors.textMuted}>{t('description')}</Text>
      <TextField label={t('label')} value={description} onChangeText={setDescription} maxLength={4000} multiline hint={t('hint', { count: description.length })} />
    </Sheet>
  );
}

/* ---- SOS -------------------------------------------------------------------- */

const EMERGENCY = [
  { key: 'rescue', note: 'rescueNote', tel: '1122' },
  { key: 'police', note: 'policeNote', tel: '15' },
  { key: 'edhi', note: 'edhiNote', tel: '115' },
] as const;

/** SRS §9.2: alerts admin + emergency contacts; direct-dial numbers always visible. */
export function SosSheet({ visitId, description, visible, onClose }: { visitId: string; description: string; visible: boolean; onClose: () => void }) {
  const t = useT('shared.sos');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<SosResult | null>(null);
  const send = useAction(() => visitsApi.sos({ visitId, note: note.trim() || undefined }), {
    onSuccess: r => setResult(r),
    onError: () => {
      // Shown inline below with the call buttons; no toast.
      return true;
    },
  });
  const close = () => {
    setResult(null);
    setNote('');
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={result ? t('sentTitle') : t('title')}
      footer={!result ? <Button label={t('send')} icon={Siren} variant="danger" size="lg" block loading={send.isPending} onPress={() => send.run(undefined)} /> : undefined}>
      {result ? (
        <Banner tone="success" icon={Check}>
          {t('result', { admins: result.notifiedAdmins, contacts: result.notifiedContacts })}
        </Banner>
      ) : (
        <>
          <Text color={colors.textMuted}>{description}</Text>
          <TextField label={t('whatsHappening')} value={note} onChangeText={setNote} hint={t('hint')} placeholder={t('placeholder')} multiline maxLength={1000} optional />
          {!!send.error && <Banner tone="danger">{t('failed')}</Banner>}
        </>
      )}
      <Text variant="small" weight="semibold" color={ink[700]}>
        {t('callDirectly')}
      </Text>
      <View style={styles.callRow}>
        {EMERGENCY.map(e => (
          <Touchable key={e.tel} onPress={() => Linking.openURL(`tel:${e.tel}`).catch(() => {})} accessibilityRole="button" accessibilityLabel={t(e.key)} style={styles.call}>
            <Phone size={18} color={feedback.danger600} />
            <Text variant="small" weight="bold" color={feedback.danger700} align="center" numberOfLines={1}>
              {t(e.key)}
            </Text>
            <Text variant="caption" color={colors.textMuted} align="center">
              {t(e.note)}
            </Text>
          </Touchable>
        ))}
      </View>
    </Sheet>
  );
}

/* ---- Reschedule ------------------------------------------------------------- */

/** Move one not-yet-started visit (the API cancels it and creates a replacement). */
/** `onMoved` gets the replacement visit: rescheduling cancels the old one and creates a new one. */
export function RescheduleSheet({ bookingId, visit, visible, onClose, onMoved }: { bookingId: string; visit: Visit | null; visible: boolean; onClose: () => void; onMoved?: (next: Visit) => void }) {
  if (!visit) return null;
  return <RescheduleBody key={visit.id} bookingId={bookingId} visit={visit} visible={visible} onClose={onClose} onMoved={onMoved} />;
}

function RescheduleBody({ bookingId, visit, visible, onClose, onMoved }: { bookingId: string; visit: Visit; visible: boolean; onClose: () => void; onMoved?: (next: Visit) => void }) {
  const t = useT('customerB.reschedule');
  const f = useFmt();
  const today = todayKey();
  const [date, setDate] = useState(visit.scheduledDate.slice(0, 10));
  const [from, setFrom] = useState(visit.timeWindowStart);
  const [to, setTo] = useState(visit.timeWindowEnd);
  const error = !date
    ? t('errNoDate')
    : date < today
      ? t('errPast')
      : date === today && from < nowHHmm()
        ? t('errPastTime')
        : from >= to
          ? t('errEndBeforeStart')
          : null;
  const unchanged = date === visit.scheduledDate.slice(0, 10) && from === visit.timeWindowStart && to === visit.timeWindowEnd;
  const save = useAction(() => bookingsApi.reschedule(bookingId, { visitId: visit.id, newDate: date, timeWindowStart: from, timeWindowEnd: to }), {
    invalidate: [keys.bookings, keys.visit],
    success: t('success'),
    onSuccess: next => {
      onClose();
      onMoved?.(next);
    },
  });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('title')}
      footer={
        <View style={styles.gapSm}>
          <Button label={t('submit')} size="lg" block disabled={!!error || unchanged} loading={save.isPending} onPress={() => save.run(undefined)} />
          <Button label={t('keep')} variant="secondary" block onPress={onClose} />
        </View>
      }>
      <Text color={colors.textMuted}>{t('currently', { day: f.longDay(visit.scheduledDate), time: f.timeWindow(visit.timeWindowStart, visit.timeWindowEnd) })}</Text>
      <DateStrip
        label={t('newDate')}
        value={date}
        onChange={d => {
          setDate(d);
          // Moving to today: start from now, not from a time that has passed.
          if (d === today && from < nextSlot()) {
            const w = windowFrom(nextSlot());
            setFrom(w.from);
            setTo(w.to);
          }
        }}
        from={today}
      />
      <TimeWindowPicker from={from} to={to} onFrom={setFrom} onTo={setTo} fromLabel={t('arriveBetween')} toLabel={t('and')} minFrom={date === today ? nextSlot() : undefined} />
      {!!error && !unchanged && (
        <Text variant="small" color={feedback.danger700}>
          {error}
        </Text>
      )}
    </Sheet>
  );
}

/* ---- Disputes list ---------------------------------------------------------- */

export function useMyDisputes() {
  return useQuery([...keys.disputes, 'mine'], () => disputesApi.list());
}

export function DisputeItem({ d, userId, onViewVisit }: { d: DisputeRow; userId?: string; onViewVisit?: (visitId: string) => void }) {
  const t = useT('customerB.disputes');
  const L = useLabels();
  const f = useFmt();
  return (
    <View style={styles.dispute}>
      <View style={styles.payRow}>
        <Text variant="caption" color={colors.textMuted} style={styles.flex}>
          {d.raisedById === userId ? t('raisedByYou', { date: f.dateTime(d.createdAt) }) : t('raisedAgainstYou', { date: f.dateTime(d.createdAt) })}
        </Text>
        <Badge tone={d.status === 'OPEN' ? 'warning' : 'success'} label={L.dispute(d.status)} />
      </View>
      <Text variant="small">{d.description}</Text>
      {d.status === 'RESOLVED' && (
        <Banner tone="success">
          <Text variant="small" weight="bold" color={feedback.success700}>
            {d.resolvedAt ? t('resolvedAt', { date: f.dateTime(d.resolvedAt) }) : t('resolved')}
          </Text>
          {!!d.resolutionNote && (
            <Text variant="small" color={feedback.success700}>
              {d.resolutionNote}
            </Text>
          )}
        </Banner>
      )}
      {onViewVisit && <Button label={t('viewVisit')} variant="ghost" onPress={() => onViewVisit(d.visitId)} style={styles.start} />}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  start: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  disabled: { opacity: 0.55 },
  payBox: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: ink[100], backgroundColor: colors.surface },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  method: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 2, overflow: 'hidden' },
  methodOn: { borderColor: brand[500], backgroundColor: brand[50] },
  methodOff: { borderColor: ink[100] },
  methodIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: ink[100], alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: ink[300] },
  radioOn: { borderWidth: 7, borderColor: brand[600] },
  reviewDone: { gap: 6, padding: space.lg, borderRadius: radius.md, backgroundColor: accent[50], borderWidth: 1, borderColor: accent[100] },
  starsRow: { flexDirection: 'row', gap: 2 },
  starBtn: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, overflow: 'hidden' },
  callRow: { flexDirection: 'row', gap: space.sm },
  call: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: radius.md, borderWidth: 1.5, borderColor: feedback.danger200, backgroundColor: feedback.danger50, overflow: 'hidden' },
  dispute: { gap: space.sm, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: ink[100], backgroundColor: colors.surface },
}));
