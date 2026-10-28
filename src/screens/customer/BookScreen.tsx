import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { addressesApi, bookingsApi, patientsApi, promosApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import { ApiError, type UploadFile } from '../../api/http';
import type { PromoQuote, PublicCaregiver } from '../../api/types';
import { TextField } from '../../components/form';
import { Check, CircleCheck, FileText, MapPin, Plus, TriangleAlert, User, X, type IconType } from '../../components/icons';
import { useToast } from '../../components/overlay';
import { ErrorState, Screen, Skeleton } from '../../components/screen';
import { RichText, Text } from '../../components/Text';
import { Avatar, Button, Card, Divider, IconButton, Segmented, Touchable } from '../../components/ui';
import { useT } from '../../i18n';
import { formatBytes, formatMoney, useFmt, useLabels } from '../../i18n/format';
import { useAction, useApiErrorText, useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { brand, colors, feedback, ink, radius, space, themed } from '../../theme';
import { AttachSheet } from './components/attach';
import { Banner, Choice, Rating, firstName, isUnreadableMedical, nowHHmm, todayKey, useCaregiver, LineIcon } from './components/bits';
import { DateStrip, TimeWindowPicker, addDays, nextSlot, windowFrom } from './components/dates';
import { CloudUpload } from './components/icons';

const STEPS = ['who', 'where', 'when', 'review'] as const;
/** ISO weekday (1 = Mon … 7 = Sun), as the bookings API expects. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const MAX_RANGE_DAYS = 60;

/** Same expansion as the backend: every date in range whose ISO weekday is selected. */
function countVisits(type: 'SINGLE' | 'RECURRING', start: string, end: string, weekdays: number[]): string[] {
  if (!start) return [];
  if (type === 'SINGLE') return [start];
  if (!end || end < start) return [];
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const iso = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
    if (weekdays.includes(iso)) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Days of week (0 = Sun) in the plan that fall outside the caregiver's weekly hours. */
function outsideHours(c: PublicCaregiver, dates: string[], start: string, end: string): number[] {
  const off = new Set<number>();
  for (const d of dates) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (!c.availabilityRules.some(r => r.dayOfWeek === dow && r.startTime <= start && r.endTime >= end)) off.add(dow);
  }
  return [...off];
}

/** FR-C5/C6/C7: who → where → when → review, then send the request. */
export function BookScreen({ route, navigation }: CustomerScreen<'Book'>) {
  const { caregiverId: id } = route.params;
  const t = useT('customerA.book');
  const tc = useT('common.actions');
  const f = useFmt();
  const L = useLabels();
  const toast = useToast();
  const apiError = useApiErrorText();
  const caregiver = useCaregiver(id);
  const patients = useQuery(keys.patients, () => patientsApi.list());
  const addresses = useQuery(keys.addresses, () => addressesApi.list());

  const today = todayKey();
  const [step, setStep] = useState(0);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [type, setType] = useState<'SINGLE' | 'RECURRING'>('SINGLE');
  const [start, setStart] = useState(addDays(today, 1));
  const [end, setEnd] = useState(addDays(today, 14));
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [from, setFrom] = useState('10:00');
  const [to, setTo] = useState('11:00');
  const [promo, setPromo] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [applied, setApplied] = useState<PromoQuote | null>(null);
  const [rx, setRx] = useState<UploadFile | null>(null);
  const [attaching, setAttaching] = useState(false);

  // Preselect the only choice, or the one just added from the form screen.
  useAutoSelect(patients.data, patientId, setPatientId);
  useAutoSelect(addresses.data, addressId, setAddressId);

  // Android back / header back steps through the flow before leaving it.
  const leaving = useRef(false);
  useEffect(
    () =>
      navigation.addListener('beforeRemove', e => {
        if (step === 0 || leaving.current) return;
        e.preventDefault();
        setStep(s => s - 1);
      }),
    [navigation, step],
  );

  const c = caregiver.data;
  const pickStart = (value: string) => {
    setStart(value);
    if (value === today) {
      // Today starts now (the next half hour); the family can push it later.
      const w = windowFrom(nextSlot());
      setFrom(w.from);
      setTo(w.to);
    }
    if (end < value) setEnd(addDays(value, 14));
  };
  useEffect(() => {
    if (start !== today) return;
    const tick = () => {
      const min = nextSlot();
      if (from < min) {
        const w = windowFrom(min);
        setFrom(w.from);
        if (to <= w.from) setTo(w.to);
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [start, today, from, to]);
  const maxEnd = addDays(start, MAX_RANGE_DAYS);
  const dates = useMemo(() => countVisits(type, start, end, weekdays), [type, start, end, weekdays]);
  const offDays = c && dates.length ? outsideHours(c, dates, from, to) : [];
  const patient = patients.data?.find(p => p.id === patientId);
  const address = addresses.data?.find(a => a.id === addressId);

  const whenError = !start
    ? t('errors.chooseDate')
    : start < today
      ? t('errors.past')
      : start === today && from < nowHHmm()
        ? t('errors.pastTime')
        : from >= to
          ? t('errors.endTime')
          : type === 'RECURRING' && !end
            ? t('errors.chooseEnd')
            : type === 'RECURRING' && end < start
              ? t('errors.endBefore')
              : type === 'RECURRING' && end > maxEnd
                ? t('errors.maxRange', { n: MAX_RANGE_DAYS })
                : type === 'RECURRING' && weekdays.length === 0
                  ? t('errors.pickDay')
                  : dates.length === 0
                    ? t('errors.noDates')
                    : null;
  const daysText = type === 'RECURRING' ? f.weekdays(weekdays) : start ? f.longDay(start) : '';
  const windowText = f.timeWindow(from, to);
  const addressOutOfArea = !!(c && address && !c.serviceArea.cities.includes(address.city));
  const stepOk = [!!patientId, !!addressId && !addressOutOfArea, !whenError, true][step];

  const book = useAction(
    async () => {
      const booking = await bookingsApi.create({
        patientId: patientId!,
        caregiverId: id,
        addressId: addressId!,
        type,
        startDate: start,
        endDate: type === 'SINGLE' ? start : end,
        timeWindowStart: from,
        timeWindowEnd: to,
        ...(type === 'RECURRING' ? { weekdays } : {}),
        // Only a code the quote accepted; a typed-but-unapplied code would change the price silently.
        ...(applied ? { promoCode: applied.code } : {}),
      });
      if (rx) {
        try {
          await bookingsApi.uploadPrescription(booking.id, rx);
        } catch {
          toast.error(t('rxFailed'));
        }
      }
      return booking;
    },
    {
      invalidate: [keys.bookings],
      success: t('success'),
      onSuccess: b => {
        leaving.current = true;
        navigation.replace('BookingDetail', { id: b.id });
      },
      onError: err => {
        if (err instanceof ApiError && err.message.startsWith('Promo code')) {
          setPromoError(apiError(err));
          return true;
        }
      },
    },
  );

  const quote = useAction(() => promosApi.quote(promo.trim().toUpperCase(), id), {
    onSuccess: q => {
      setApplied(q);
      setPromoError(null);
    },
    onError: err => {
      setApplied(null);
      setPromoError(apiError(err));
      return true;
    },
  });

  const perVisit = c?.ratePerVisit ?? 0;
  const effective = applied ? applied.perVisitAfterDiscount : perVisit;

  return (
    <Screen
      // First name only: the card below already shows the full name.
      title={c ? t('title', { name: firstName(c.user.fullName) }) : undefined}
      back
      footer={
        <View style={styles.footer}>
          {step > 0 && <Button label={tc('back')} variant="secondary" onPress={() => setStep(step - 1)} style={styles.backBtn} />}
          {step < 3 ? (
            <Button label={tc('continue')} size="lg" disabled={!stepOk} onPress={() => setStep(step + 1)} style={styles.flex} />
          ) : (
            <Button label={t('send')} size="lg" loading={book.isPending} onPress={() => book.run(undefined)} style={styles.flex} />
          )}
        </View>
      }>
      {caregiver.error && !c ? (
        <ErrorState error={caregiver.error} onRetry={caregiver.refetch} />
      ) : !c ? (
        <Skeleton height={80} />
      ) : (
        <Card style={styles.who}>
          <Avatar name={c.user.fullName} uri={c.photoUrl} />
          <View style={styles.flex}>
            <Text weight="bold" numberOfLines={1}>
              {c.user.fullName}
            </Text>
            <View style={styles.rowWrap}>
              <Text variant="small" color={colors.textMuted} numberOfLines={1}>
                {L.specialty(c.specialty)}
              </Text>
              <Rating average={c.ratingAverage} count={c.ratingCount} />
            </View>
          </View>
          <View style={styles.end}>
            <Text weight="extrabold" tabular numberOfLines={1}>
              {formatMoney(c.ratePerVisit)}
            </Text>
            <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
              {t('perVisit')}
            </Text>
          </View>
        </Card>
      )}

      <StepBar step={step} onJump={i => i < step && setStep(i)} />

      {step === 0 && (
        <View style={styles.gap} accessibilityRole="radiogroup" accessibilityLabel={t('who.aria')}>
          <StepTitle title={t('who.title')} text={t('who.text')} />
          {patients.error && !patients.data ? (
            <ErrorState error={patients.error} onRetry={patients.refetch} />
          ) : !patients.data ? (
            <Skeleton height={80} />
          ) : (
            patients.data.map(p => (
              <Choice key={p.id} selected={patientId === p.id} onPress={() => setPatientId(p.id)} label={p.name}>
                <Text weight="bold" numberOfLines={1}>
                  {p.name}
                  <Text color={colors.textMuted}>{`  ·  ${p.relationship === 'SELF' ? t('who.you') : t('who.family')}`}</Text>
                </Text>
                {!!p.medicalContext && !isUnreadableMedical(p.medicalContext) && (
                  <Text variant="small" color={colors.textMuted} numberOfLines={2}>
                    {p.medicalContext}
                  </Text>
                )}
              </Choice>
            ))
          )}
          <Button label={t('who.add')} icon={Plus} variant="secondary" onPress={() => navigation.navigate('PatientForm')} style={styles.start} />
        </View>
      )}

      {step === 1 && (
        <View style={styles.gap} accessibilityRole="radiogroup" accessibilityLabel={t('where.aria')}>
          <StepTitle title={t('where.title')} text={c ? t('where.cities', { name: firstName(c.user.fullName), cities: f.list(c.serviceArea.cities) }) : undefined} />
          {addresses.error && !addresses.data ? (
            <ErrorState error={addresses.error} onRetry={addresses.refetch} />
          ) : !addresses.data ? (
            <Skeleton height={80} />
          ) : (
            addresses.data.map(a => {
              const out = c && !c.serviceArea.cities.includes(a.city);
              return (
                <Choice key={a.id} selected={addressId === a.id} onPress={() => setAddressId(a.id)} label={a.label || a.city}>
                  <Text weight="bold" numberOfLines={1}>
                    {a.label || a.city}
                  </Text>
                  <Text variant="small" color={colors.textMuted}>
                    {a.addressLine}, {a.city}
                  </Text>
                  {out && (
                    <View style={styles.warnLine}>
                      <TriangleAlert size={14} color={feedback.warning700} />
                      <Text variant="caption" weight="semibold" color={feedback.warning700} style={styles.flex}>
                        {t('where.outOfArea')}
                      </Text>
                    </View>
                  )}
                </Choice>
              );
            })
          )}
          <Button label={t('where.add')} icon={Plus} variant="secondary" onPress={() => navigation.navigate('AddressForm')} style={styles.start} />
        </View>
      )}

      {step === 2 && (
        <View style={styles.gapLg}>
          <StepTitle title={t('when.title')} />
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: 'SINGLE', label: t('when.single') },
              { value: 'RECURRING', label: t('when.recurring') },
            ]}
          />
          <DateStrip label={type === 'SINGLE' ? t('when.date') : t('when.from')} value={start} onChange={pickStart} from={today} />
          {type === 'RECURRING' && (
            <>
              <View style={styles.gapSm}>
                <DateStrip label={t('when.until')} value={end} onChange={setEnd} from={start} count={MAX_RANGE_DAYS + 1} />
                <Text variant="caption" color={colors.textMuted}>
                  {t('when.upTo', { n: MAX_RANGE_DAYS })}
                </Text>
              </View>
              <View style={styles.gapSm}>
                <Text variant="small" weight="semibold" color={ink[700]}>
                  {t('when.onDays')}
                </Text>
                <View style={styles.weekdays}>
                  {WEEKDAYS.map(iso => {
                    const on = weekdays.includes(iso);
                    return (
                      <Touchable
                        key={iso}
                        onPress={() => setWeekdays(w => (on ? w.filter(x => x !== iso) : [...w, iso].sort()))}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={f.dayOfWeekLong(iso % 7)}
                        style={[styles.wd, on ? styles.wdOn : styles.wdOff]}>
                        <Text variant="small" weight="bold" color={on ? '#fff' : ink[600]} align="center" numberOfLines={1}>
                          {f.dayOfWeek(iso % 7)}
                        </Text>
                      </Touchable>
                    );
                  })}
                </View>
              </View>
            </>
          )}
          <TimeWindowPicker
            from={from}
            to={to}
            onFrom={setFrom}
            onTo={setTo}
            fromLabel={t('when.arriveBetween')}
            toLabel={t('when.and')}
            minFrom={start === today ? nextSlot() : undefined}
          />
          {whenError ? (
            <Text variant="small" weight="semibold" color={feedback.danger700}>
              {whenError}
            </Text>
          ) : (
            <View style={styles.gapSm}>
              <Banner icon={CircleCheck}>
                <RichText variant="small" color={brand[800]}>
                  {t.raw('when.summary', { count: dates.length, days: daysText, window: windowText })}
                </RichText>
              </Banner>
              {offDays.length > 0 && (
                <Banner tone="warning" icon={TriangleAlert}>
                  {t('when.offHours', { name: firstName(c?.user.fullName), days: f.list(offDays.map(d => f.dayOfWeek(d))) })}
                </Banner>
              )}
            </View>
          )}
        </View>
      )}

      {step === 3 && c && (
        <View style={styles.gapLg}>
          <StepTitle title={t('review.title')} />
          <Card padded={false}>
            <ReviewRow icon={User} label={t('review.patient')} value={patient?.name ?? ''} />
            <Divider inset={space.lg} />
            <ReviewRow icon={MapPin} label={t('review.address')} value={address ? `${address.addressLine}, ${address.city}` : ''} />
            <Divider inset={space.lg} />
            <ReviewRow icon={Check} label={t('review.schedule')} value={t('review.scheduleValue', { count: dates.length, days: daysText, window: windowText })} />
          </Card>

          <View style={styles.gapSm}>
            <Text variant="small" weight="semibold" color={ink[700]}>
              {t('review.rxTitle')}
            </Text>
            {rx ? (
              <View style={styles.file}>
                <FileText size={20} color={brand[600]} />
                <Text variant="small" weight="semibold" style={styles.flex} numberOfLines={1}>
                  {rx.name} <Text variant="small" color={colors.textMuted}>{`· ${formatBytes(rx.size)}`}</Text>
                </Text>
                <IconButton icon={X} label={t('review.removeFile')} onPress={() => setRx(null)} size={18} />
              </View>
            ) : (
              <Touchable onPress={() => setAttaching(true)} accessibilityRole="button" style={styles.attach}>
                <CloudUpload size={20} color={brand[700]} />
                <Text variant="small" weight="semibold" color={brand[700]} style={styles.shrink}>
                  {t('review.rxAdd')}
                </Text>
              </Touchable>
            )}
          </View>

          {/* Label and hint sit outside the row so the Apply button lines up with the input itself. */}
          <Text variant="small" weight="semibold" color={ink[700]}>
            {t('review.promo')}
          </Text>
          <View style={styles.promoRow}>
            <View style={styles.flex}>
              <TextField
                accessibilityLabel={t('review.promo')}
                value={promo}
                maxLength={24}
                autoCapitalize="characters"
                placeholder={t('review.promoPlaceholder')}
                ltr
                error={promoError}
                onChangeText={v => {
                  setPromo(v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
                  setPromoError(null);
                  setApplied(null);
                }}
              />
            </View>
            <Button label={t('review.promoApply')} variant="secondary" loading={quote.isPending} disabled={!promo.trim()} onPress={() => quote.run(undefined)} style={styles.applyBtn} />
          </View>
          {!applied && !promoError && (
            <Text variant="small" color={colors.textMuted}>
              {t('review.promoHint')}
            </Text>
          )}
          {applied && (
            <View style={styles.warnLine}>
              <Check size={16} color={feedback.success700} />
              <Text variant="small" weight="semibold" color={feedback.success700} style={styles.flex}>
                {t('review.promoOk', { amount: formatMoney(applied.discountAmount) })}
              </Text>
            </View>
          )}

          <View style={styles.total}>
            <View style={styles.totalRow}>
              <Text variant="small" color={ink[600]} style={styles.flex}>
                {t('review.price', { price: formatMoney(perVisit), count: dates.length })}
              </Text>
              <Text variant="small" weight="bold" tabular color={applied ? ink[400] : colors.text} style={applied ? styles.strike : undefined} numberOfLines={1}>
                {formatMoney(perVisit * dates.length)}
              </Text>
            </View>
            {applied && (
              <>
                <View style={styles.totalRow}>
                  <Text variant="small" color={feedback.success700} style={styles.flex}>
                    {t('review.promoLine', { code: applied.code })}
                  </Text>
                  <Text variant="small" color={feedback.success700} tabular numberOfLines={1}>
                    {formatMoney(-applied.discountAmount * dates.length)}
                  </Text>
                </View>
                <View style={[styles.totalRow, styles.totalLine]}>
                  <Text weight="semibold" style={styles.flex}>
                    {t('review.total')}
                  </Text>
                  <Text weight="extrabold" tabular numberOfLines={1}>
                    {formatMoney(effective * dates.length)}
                  </Text>
                </View>
              </>
            )}
            <Text variant="caption" color={colors.textMuted}>
              {t('review.payNote')}
            </Text>
          </View>
        </View>
      )}

      <AttachSheet visible={attaching} title={t('review.rxTitle')} onClose={() => setAttaching(false)} onPick={setRx} />
    </Screen>
  );
}

function useAutoSelect<T extends { id: string; createdAt: string }>(items: T[] | undefined, selected: string | null, select: (id: string) => void) {
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (!items) return;
    const grew = prev.current !== null && items.length > prev.current;
    prev.current = items.length;
    if (grew) select([...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].id);
    else if (!selected && items.length === 1) select(items[0].id);
  }, [items, selected, select]);
}

/**
 * Real sequence, so numbered: circles joined by a line. Done = filled with a
 * tick, current = ringed, later = outlined. A flex row, so it mirrors in Urdu.
 */
function StepBar({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  const t = useT('customerA.book');
  return (
    <View style={styles.steps} accessibilityLabel={t('stepsLabel')}>
      {STEPS.map((key, i) => {
        const done = i < step;
        const now = i === step;
        return (
          <Touchable
            key={key}
            onPress={() => onJump(i)}
            disabled={!done}
            pressScale={false}
            accessibilityRole="button"
            accessibilityState={{ selected: now, disabled: !done }}
            style={styles.stepItem}>
            <View style={styles.stepTrack}>
              <View style={[styles.stepLine, i === 0 && styles.hidden, i <= step && styles.stepLineOn]} />
              <View style={[styles.stepDot, done && styles.stepDotDone, now && styles.stepDotNow]}>
                {done ? (
                  <Check size={16} color="#fff" strokeWidth={3} />
                ) : (
                  <Text variant="small" weight="bold" color={now ? brand[700] : ink[400]} align="center" numeric>
                    {String(i + 1)}
                  </Text>
                )}
              </View>
              <View style={[styles.stepLine, i === STEPS.length - 1 && styles.hidden, i < step && styles.stepLineOn]} />
            </View>
            <Text variant="caption" weight={now ? 'bold' : 'semibold'} color={i <= step ? colors.text : ink[400]} align="center" numberOfLines={1}>
              {t(`steps.${key}`)}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

function StepTitle({ title, text }: { title: string; text?: string }) {
  return (
    <View style={styles.gapXs}>
      <Text variant="title" weight="extrabold" accessibilityRole="header">
        {title}
      </Text>
      {!!text && (
        <Text variant="small" color={colors.textMuted}>
          {text}
        </Text>
      )}
    </View>
  );
}

function ReviewRow({ icon: Icon, label, value }: { icon: IconType; label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <LineIcon icon={Icon} color={ink[400]} />
      <Text variant="small" color={colors.textMuted} style={styles.reviewLabel}>
        {label}
      </Text>
      <Text variant="small" weight="semibold" style={styles.flex}>
        {value}
      </Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  start: { alignSelf: 'flex-start' },
  end: { alignItems: 'flex-end' },
  gap: { gap: space.md },
  gapLg: { gap: space.lg },
  gapSm: { gap: space.sm },
  gapXs: { gap: 2 },
  footer: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  backBtn: { minWidth: 96 },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md },
  steps: { flexDirection: 'row' },
  stepItem: { flex: 1, gap: 6, paddingVertical: 4, minHeight: 56, alignItems: 'stretch' },
  stepTrack: { flexDirection: 'row', alignItems: 'center' },
  stepLine: { flex: 1, height: 3, backgroundColor: ink[200] },
  stepLineOn: { backgroundColor: brand[600] },
  hidden: { opacity: 0 },
  stepDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: ink[200], backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: brand[600], borderColor: brand[600] },
  stepDotNow: { borderColor: brand[600], borderWidth: 3, backgroundColor: brand[50] },
  warnLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  // Seven equal chips on one row, also at 360dp in Urdu (labels auto-fit).
  weekdays: { flexDirection: 'row', gap: 6 },
  wd: { flex: 1, minWidth: 0, height: 44, paddingHorizontal: 2, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  wdOn: { backgroundColor: brand[700], borderColor: brand[700] },
  wdOff: { backgroundColor: colors.surface, borderColor: ink[200] },
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  reviewLabel: { width: 96 },
  file: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingStart: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: ink[100], backgroundColor: colors.surface },
  attach: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 64, borderRadius: radius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: ink[200], overflow: 'hidden' },
  promoRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  // Input box is TOUCH + 4 (52) tall, buttons 46: offset by half the difference to centre it.
  applyBtn: { marginTop: 3 },
  total: { gap: 6, padding: space.lg, borderRadius: radius.md, backgroundColor: ink[50] },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  totalLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink[200], paddingTop: 6 },
  strike: { textDecorationLine: 'line-through' },
}));
