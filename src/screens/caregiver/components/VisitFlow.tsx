import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { visitsApi } from '../../../api/caregiver/api';
import { keys } from '../../../api/caregiver/keys';
import { MOCK_OTP } from '../../../api/caregiver/mock-handlers';
import { USE_MOCKS } from '../../../api/config';
import type { CaregiverVisitDetail, CheckInInput } from '../../../api/types';
import { useDeviceErrorText } from '../../../components/FilePickerSheet';
import { OtpInput, TextField } from '../../../components/form';
import { useToast } from '../../../components/overlay';
import { getDeviceLocation } from '../../../lib/location';
import { Check, CircleCheck, Star } from '../../../components/icons';
import { RichText, Text } from '../../../components/Text';
import { Button, Chip, Segmented, Touchable } from '../../../components/ui';
import { useT } from '../../../i18n';
import { useFmt } from '../../../i18n/format';
import { formatPkMobile } from '../../../lib/phone';
import { useAction, useApiErrorText, type QueryKey } from '../../../lib/query';
import { accent, brand, colors, feedback, ink, radius, space, themed } from '../../../theme';
import { openMaps, useNow, visitStart } from './helpers';
import { Car, KeyRound, LocateFixed, MapPinned } from './icons';

export const visitKey = (id: string) => ['cg-visit', id] as const;

const STEPS = ['travel', 'checkIn', 'checkOut', 'note'] as const;

export function stepIndex(status: CaregiverVisitDetail['status']): number {
  switch (status) {
    case 'CONFIRMED':
      return 0;
    case 'EN_ROUTE':
      return 1;
    case 'CHECKED_IN':
    case 'IN_PROGRESS':
      return 2;
    case 'CHECKED_OUT':
      return 3;
    case 'COMPLETED':
      return 4;
    default:
      return -1;
  }
}

/** Numbered because the visit really is a fixed sequence. */
export function Stepper({ current, dark }: { current: number; dark?: boolean }) {
  const t = useT('caregiverB.flow');
  const on = dark ? accent[400] : brand[600];
  const off = dark ? 'rgba(255,255,255,0.18)' : ink[100];
  return (
    <View style={styles.stepper} accessibilityLabel={t('progress')}>
      {STEPS.map((key, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <View key={key} style={styles.step} accessibilityState={{ selected: now }}>
            <View style={styles.stepTrack}>
              <View style={[styles.line, i === 0 ? styles.clear : { backgroundColor: done || now ? on : off }]} />
              <View style={[styles.dot, { backgroundColor: done || now ? on : off }, now && (dark ? styles.ringDark : styles.ring)]}>
                {done ? (
                  <Check size={14} color={dark ? brand[950] : '#fff'} strokeWidth={3} />
                ) : (
                  <Text variant="caption" weight="bold" color={now ? (dark ? brand[950] : '#fff') : dark ? 'rgba(255,255,255,0.6)' : ink[400]} align="center" numeric>
                    {String(i + 1)}
                  </Text>
                )}
              </View>
              <View style={[styles.line, i === STEPS.length - 1 ? styles.clear : { backgroundColor: done ? on : off }]} />
            </View>
            <Text variant="caption" weight="semibold" align="center" numberOfLines={1} color={dark ? (done || now ? '#fff' : 'rgba(255,255,255,0.6)') : done || now ? ink[900] : ink[400]}>
              {t(`steps.${key}`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function maskPhone(e164: string) {
  return formatPkMobile(e164).replace(/(\d{3})(\d{4})(⁩?)$/, (_m, a: string, b: string, end: string) => `${a.slice(0, 1)}**${b.slice(-3).padStart(4, '*')}${end}`);
}

/**
 * GPS or the family's code. There is no geolocation module yet, so "GPS"
 * sends the booking address as the device position (demo behaviour).
 */
function Verify({ visit, invalidate, kind }: { visit: CaregiverVisitDetail; invalidate: QueryKey[]; kind: 'in' | 'out' }) {
  const t = useT('caregiverB.flow');
  const tm = useT('mobile.common');
  const apiError = useApiErrorText();
  const [mode, setMode] = useState<'gps' | 'otp'>('gps');
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);

  const call = kind === 'in' ? visitsApi.checkIn : visitsApi.checkOut;
  const act = useAction((dto: CheckInInput) => call(visit.id, dto), {
    invalidate,
    success: kind === 'in' ? t('checkedInToast') : t('checkedOutToast'),
    onError: err => {
      if (mode === 'otp') {
        setOtpError(apiError(err));
        setCode('');
        return true;
      }
    },
  });
  const sendCode = useAction(() => visitsApi.checkInOtp(visit.id), {
    onSuccess: r => {
      setSent(r.sentTo);
      setOtpError(null);
      setCode('');
    },
  });

  // FR-CG7: the phone's real position is recorded (and audited) with the check-in/out.
  const [locating, setLocating] = useState(false);
  const toast = useToast();
  const deviceError = useDeviceErrorText();
  const gps = async () => {
    setLocating(true);
    try {
      const p = await getDeviceLocation();
      await act.run({ method: 'GPS', lat: p.lat, lng: p.lng });
    } catch (e) {
      toast.error(deviceError(e));
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={styles.gap}>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'gps', label: t('tabGps') },
          { value: 'otp', label: t('tabOtp') },
        ]}
      />
      {mode === 'gps' ? (
        <View style={styles.gapSm}>
          <Button label={kind === 'in' ? t('checkInGps') : t('checkOutGps')} icon={kind === 'in' ? LocateFixed : CircleCheck} variant={kind === 'in' ? 'primary' : 'success'} size="lg" block loading={locating || act.isPending} onPress={gps} />
          <Text variant="caption" color={colors.textMuted}>
            {tm('gpsHint')}
          </Text>
        </View>
      ) : !sent ? (
        <View style={styles.gapSm}>
          <Text variant="small" color={ink[600]}>
            {t('otpIntro')}
          </Text>
          <Button label={t('sendCode')} icon={KeyRound} size="lg" block loading={sendCode.isPending} onPress={() => sendCode.run(undefined)} />
        </View>
      ) : (
        <View style={styles.gapSm}>
          <RichText variant="small" color={ink[600]} boldColor={ink[900]}>
            {t.raw('codeSent', { phone: maskPhone(sent) })}
          </RichText>
          <OtpInput
            value={code}
            error={!!otpError}
            onChange={v => {
              setCode(v);
              setOtpError(null);
              if (v.length === 6) act.run({ method: 'OTP', code: v });
            }}
          />
          {!!otpError && (
            <Text variant="small" color={feedback.danger700} accessibilityLiveRegion="polite">
              {otpError}
            </Text>
          )}
          <View style={styles.otpActions}>
            <Touchable onPress={() => sendCode.run(undefined)} accessibilityRole="button" style={[styles.link, styles.shrink]}>
              <Text variant="small" weight="bold" color={brand[700]} numberOfLines={1}>
                {t('newCode')}
              </Text>
            </Touchable>
            <Button label={kind === 'in' ? t('checkIn') : t('checkOutConfirm')} variant={kind === 'in' ? 'primary' : 'success'} loading={act.isPending} disabled={code.length !== 6} onPress={() => act.run({ method: 'OTP', code })} />
          </View>
          {USE_MOCKS && (
            <Text variant="caption" color={accent[700]}>
              {t('mockCode', { code: MOCK_OTP })}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function Elapsed({ since }: { since: string }) {
  const now = useNow(1000);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const label = `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <Text variant="display" weight="extrabold" align="center" tabular style={styles.ltr} accessibilityRole="timer">
      {label}
    </Text>
  );
}

const NOTE_PROMPTS = ['vitals', 'medication', 'care', 'observations', 'advice'] as const;

function NoteForm({ visit, invalidate }: { visit: CaregiverVisitDetail; invalidate: QueryKey[] }) {
  const t = useT('caregiverB.flow');
  const tm = useT('mobileCaregiver.visit');
  const [summary, setSummary] = useState('');
  const submit = useAction(() => visitsApi.note(visit.id, summary.trim()), {
    invalidate: [...invalidate, keys.earnings],
    success: t('completedToast'),
  });
  return (
    <View style={styles.gap}>
      <View>
        <Text variant="title" weight="extrabold">
          {t('noteTitle')}
        </Text>
        <Text variant="small" color={colors.textMuted}>
          {t('noteDesc')}
        </Text>
      </View>
      <View style={styles.chips}>
        {NOTE_PROMPTS.map(k => {
          const p = t(`prompts.${k}.prefix`);
          return <Chip key={k} label={`+ ${t(`prompts.${k}.label`)}`} onPress={() => setSummary(s => (s && !s.endsWith('\n') ? `${s}\n${p} ` : `${s}${p} `))} />;
        })}
      </View>
      <TextField label={t('noteLabel')} value={summary} onChangeText={setSummary} placeholder={t('notePlaceholder')} multiline maxLength={4000} hint={tm('noteCount', { count: summary.length })} />
      <Button label={t('submitNote')} variant="success" size="lg" block loading={submit.isPending} disabled={!summary.trim()} onPress={() => submit.run(undefined)} />
    </View>
  );
}

/** Travel → check in → check out → note (SRS §8.2, FR-CG7/CG8). */
export function VisitFlow({ visit }: { visit: CaregiverVisitDetail }) {
  const t = useT('caregiverB.flow');
  const f = useFmt();
  const now = useNow(60_000);
  const invalidate: QueryKey[] = [keys.visits, visitKey(visit.id)];
  const current = stepIndex(visit.status);
  const enRoute = useAction(() => visitsApi.enRoute(visit.id), { invalidate, success: t('enRouteToast') });
  if (current < 0) return null;
  const early = visit.status === 'CONFIRMED' && visitStart(visit.scheduledDate, visit.timeWindowStart) - now > 3 * 3600_000;

  return (
    <View style={styles.gapLg}>
      <Stepper current={current} />

      {visit.status === 'CONFIRMED' && (
        <View style={styles.gap}>
          <View>
            <Text variant="title" weight="extrabold">
              {t('readyTitle')}
            </Text>
            <Text variant="small" color={colors.textMuted}>
              {t('readyDesc')}
            </Text>
          </View>
          {early && (
            <View style={styles.warn}>
              <Text variant="small" color={accent[700]}>
                {t('earlyWarning')}
              </Text>
            </View>
          )}
          <Button label={t('startTravel')} icon={Car} size="lg" block loading={enRoute.isPending} onPress={() => enRoute.run(undefined)} />
          <Button label={t('directions')} icon={MapPinned} variant="secondary" block onPress={() => openMaps(visit.booking.address)} />
        </View>
      )}

      {visit.status === 'EN_ROUTE' && (
        <View style={styles.gap}>
          <View>
            <Text variant="title" weight="extrabold">
              {t('checkInTitle')}
            </Text>
            <Text variant="small" color={colors.textMuted}>
              {t('checkInDesc')}
            </Text>
          </View>
          <Verify visit={visit} invalidate={invalidate} kind="in" />
        </View>
      )}

      {(visit.status === 'CHECKED_IN' || visit.status === 'IN_PROGRESS') && (
        <View style={styles.gap}>
          <View style={styles.center}>
            <Text variant="small" weight="bold" color={brand[700]} align="center">
              {t('inProgress')}
            </Text>
            {!!visit.checkInAt && <Elapsed since={visit.checkInAt} />}
            <Text variant="caption" color={colors.textMuted} align="center" numberOfLines={1}>
              {t('checkedInAt', { time: f.dateTime(visit.checkInAt) })}
            </Text>
          </View>
          <Verify visit={visit} invalidate={invalidate} kind="out" />
        </View>
      )}

      {visit.status === 'CHECKED_OUT' && <NoteForm visit={visit} invalidate={invalidate} />}

      {visit.status === 'COMPLETED' && (
        <View style={styles.gap}>
          <View style={styles.done}>
            <Check size={20} color={feedback.success700} />
            <Text variant="small" weight="semibold" color={feedback.success700} style={styles.flex}>
              {t('completedAt', { time: f.dateTime(visit.note?.submittedAt ?? visit.checkOutAt) })}
            </Text>
          </View>
          {!!visit.note && (
            <View style={styles.gapSm}>
              <Text variant="small" weight="bold" color={ink[600]}>
                {t('yourNote')}
              </Text>
              <View style={styles.note}>
                <Text variant="small">{visit.note.summary}</Text>
              </View>
            </View>
          )}
          {!!visit.review && (
            <View style={styles.review}>
              <View style={styles.stars} accessibilityLabel={t('stars', { rating: visit.review.rating })}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} size={18} color={i < visit.review!.rating ? accent[500] : ink[200]} fill={i < visit.review!.rating ? accent[500] : 'transparent'} />
                ))}
              </View>
              {!!visit.review.comment && <Text variant="small">{`“${visit.review.comment}”`}</Text>}
              <Text variant="caption" color={colors.textMuted}>
                {t('familyReview')}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  ltr: { writingDirection: 'ltr' },
  gapSm: { gap: space.sm },
  gap: { gap: space.md },
  gapLg: { gap: space.xl },
  center: { alignItems: 'center', gap: 2 },
  stepper: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepTrack: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 2 },
  clear: { backgroundColor: 'transparent' },
  ring: { borderWidth: 3, borderColor: brand[100] },
  ringDark: { borderWidth: 3, borderColor: 'rgba(245,181,68,0.35)' },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  warn: { backgroundColor: accent[50], borderRadius: radius.md, padding: space.md },
  otpActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs, borderRadius: radius.sm, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  done: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: feedback.success50, borderRadius: radius.md, padding: space.md },
  note: { backgroundColor: ink[25], borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: ink[100] },
  review: { gap: space.xs, backgroundColor: accent[50], borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: accent[100] },
  stars: { flexDirection: 'row', gap: 2 },
}));
