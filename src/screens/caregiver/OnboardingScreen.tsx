import React, { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { authApi, meApi, profileApi } from '../../api/caregiver/api';
import { keys } from '../../api/caregiver/keys';
import { session } from '../../api/caregiver/session';
import { ApiError } from '../../api/http';
import type { LicenseBody, Specialty } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Select, TextField } from '../../components/form';
import { Check, Settings, ShieldCheck } from '../../components/icons';
import { Header, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Button, Card, Chip, IconButton } from '../../components/ui';
import { useT } from '../../i18n';
import { formatMoney, useLabels } from '../../i18n/format';
import { useAction, useApiErrorText, useQuery } from '../../lib/query';
import { useToast } from '../../components/overlay';
import type { CaregiverSetupScreen } from '../../navigation/types';
import { brand, colors, feedback, ink, space, themed } from '../../theme';
import { Panel } from './components/Bits';
import { DocumentList, DocumentUploader } from './components/Documents';
import { CITIES, CNIC_PATTERN, digits, formatCnic, LICENSE_BODIES, SPECIALTIES } from './components/helpers';

const STEPS = ['about', 'credentials', 'services', 'documents'] as const;

const DEFAULT_BODY: Record<Specialty, LicenseBody> = {
  NURSING: 'PNC',
  POST_SURGERY_CARE: 'PNC',
  ELDERLY_CARE: 'OTHER',
  PHYSIOTHERAPY: 'OTHER',
};

/** FR-CG1: register with name, CNIC, license and certificates for verification. */
export function OnboardingScreen({ navigation }: CaregiverSetupScreen<'Onboarding'>) {
  const t = useT('caregiverB.onboarding');
  const tc = useT('common.actions');
  const tm = useT('mobileCaregiver.status');
  const L = useLabels();
  const { me, reloadMe } = useAuth();
  const toast = useToast();
  const apiError = useApiErrorText();

  const [step, setStep] = useState(0);

  // Android back steps back through the form instead of leaving the app (and the answers).
  useEffect(() => {
    if (step === 0 || step === 3) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep(s => s - 1);
      return true;
    });
    return () => sub.remove();
  }, [step]);
  const [touched, setTouched] = useState(false);
  const [name, setName] = useState(me?.fullName ?? '');
  const [cnic, setCnic] = useState('');
  const [specialty, setSpecialty] = useState<Specialty | null>(null);
  const [body, setBody] = useState<LicenseBody | null>(null);
  const [license, setLicense] = useState('');
  const [years, setYears] = useState('');
  const [cities, setCities] = useState<string[]>(CITIES.length === 1 ? [...CITIES] : []);
  const [rate, setRate] = useState('');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const yearsNum = years === '' ? undefined : Number(years);
  const rateNum = Number(rate);
  const errors: Record<number, Record<string, string | null>> = {
    0: {
      name: name.trim().length < 2 ? t('errors.name') : null,
      cnic: !CNIC_PATTERN.test(cnic) ? t('errors.cnic') : null,
    },
    1: {
      specialty: !specialty ? t('errors.specialty') : null,
      body: !body ? t('errors.body') : null,
      license: license.trim().length < 3 || license.trim().length > 40 ? t('errors.license') : null,
      years: yearsNum !== undefined && (yearsNum < 0 || yearsNum > 60) ? t('errors.years') : null,
    },
    2: {
      cities: cities.length === 0 ? t('errors.cities') : null,
      rate: !rate || rateNum < 10 ? t('errors.rate') : null,
    },
  };
  const err = (s: number, k: string) => (touched ? errors[s][k] : null);
  const stepValid = (s: number) => Object.values(errors[s] ?? {}).every(e => !e);

  const profile = useQuery(keys.profile, profileApi.get, { enabled: step === 3 });
  const docs = profile.data?.documents ?? [];

  const register = useAction(
    async () => {
      await meApi.update({ fullName: name.trim() });
      try {
        await profileApi.register({
          cnic,
          licenseNumber: license.trim(),
          licenseBody: body!,
          specialty: specialty!,
          ...(yearsNum !== undefined ? { experienceYears: yearsNum } : {}),
          ...(bio.trim() ? { bio: bio.trim() } : {}),
          serviceCities: cities,
          ratePerVisit: Math.round(rateNum * 100),
        });
      } catch (e) {
        // A retry after a network blip: the profile already exists, carry on.
        if (!(e instanceof ApiError && e.message === 'Caregiver profile already exists')) throw e;
      }
      // The access token still says CUSTOMER until refreshed. Refresh here (not
      // reloadMe) so the setup navigator stays on this screen for documents.
      const s = session.get();
      if (s) session.set({ ...s, ...(await authApi.refresh(s.refreshToken)) });
    },
    {
      invalidate: [keys.me, keys.profile],
      success: t('created'),
      onSuccess: () => {
        setTouched(false);
        setStep(3);
      },
    },
  );

  function next() {
    setTouched(true);
    if (!stepValid(step)) return;
    setTouched(false);
    if (step === 2) register.run(undefined);
    else setStep(step + 1);
  }

  async function submit() {
    setSubmitting(true);
    try {
      await reloadMe(); // navigator moves to the Status screen
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  const toggleCity = (c: string) => setCities(cs => (cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]));
  const hasLicense = docs.some(d => d.type === 'LICENSE');

  return (
    <Screen
      header={
        <Header
          title={t(`titles.${STEPS[step]}`)}
          subtitle={t('stepOf', { step: step + 1, total: STEPS.length })}
          back={step > 0 && step < 3 ? () => setStep(step - 1) : undefined}
          right={<IconButton icon={Settings} label={tm('settings')} onPress={() => navigation.navigate('Settings')} />}
        />
      }
      footer={
        step < 3 ? (
          <Button label={step === 2 ? t('createProfile') : tc('continue')} size="lg" block loading={register.isPending} onPress={next} />
        ) : (
          <Button label={t('submit')} icon={ShieldCheck} size="lg" block disabled={!hasLicense} loading={submitting} onPress={submit} />
        )
      }>
      <Progress step={step} />
      {/* Step title and "Step x of 4" live in the teal header; the body keeps only the explanation. */}
      <Text color={colors.textMuted}>{t(`descriptions.${STEPS[step]}`)}</Text>

      {step === 0 && (
        <Card style={styles.gap}>
          <TextField label={t('fullName')} value={name} onChangeText={setName} maxLength={120} autoComplete="name" textContentType="name" error={err(0, 'name')} autoFocus />
          <TextField
            label={t('cnic')}
            value={cnic}
            onChangeText={v => setCnic(formatCnic(v))}
            placeholder="35201-1234567-1"
            keyboardType="number-pad"
            ltr
            maxLength={15}
            error={err(0, 'cnic')}
          />
        </Card>
      )}

      {step === 1 && (
        <Card style={styles.gap}>
          <Select<Specialty>
            label={t('specialty')}
            value={specialty}
            placeholder={t('specialtyPlaceholder')}
            error={err(1, 'specialty')}
            onChange={v => {
              setSpecialty(v);
              if (!body) setBody(DEFAULT_BODY[v]);
            }}
            options={SPECIALTIES.map(v => ({ value: v, label: L.specialty(v), description: L.specialtyHint(v) }))}
          />
          <Select<LicenseBody>
            label={t('body')}
            value={body}
            placeholder={t('bodyPlaceholder')}
            error={err(1, 'body')}
            onChange={setBody}
            options={LICENSE_BODIES.map(v => ({ value: v, label: L.licenseBodyOption(v), description: L.licenseBodyHint(v) }))}
          />
          <TextField
            label={t('license')}
            value={license}
            onChangeText={v => setLicense(v.toUpperCase())}
            placeholder={t('licensePlaceholder')}
            autoCapitalize="characters"
            ltr
            maxLength={40}
            error={err(1, 'license')}
          />
          <TextField label={t('years')} value={years} onChangeText={v => setYears(digits(v, 2))} keyboardType="number-pad" ltr optional error={err(1, 'years')} />
        </Card>
      )}

      {step === 2 && (
        <Card style={styles.gap}>
          <View style={styles.gapSm}>
            <Text variant="small" weight="semibold" color={ink[700]}>
              {t('cities')}
            </Text>
            <View style={styles.chips}>
              {CITIES.map(c => (
                <Chip key={c} label={c} selected={cities.includes(c)} icon={cities.includes(c) ? Check : undefined} onPress={() => toggleCity(c)} />
              ))}
            </View>
            {!!err(2, 'cities') && (
              <Text variant="small" color={feedback.danger700}>
                {err(2, 'cities')}
              </Text>
            )}
          </View>
          <TextField
            label={t('rate')}
            value={rate}
            onChangeText={v => setRate(digits(v, 6))}
            placeholder="2500"
            prefix="Rs"
            keyboardType="number-pad"
            ltr
            error={err(2, 'rate')}
            hint={rateNum >= 10 ? t('rateHintAmount', { amount: formatMoney(Math.round(rateNum * 100)) }) : t('rateHint')}
          />
          <TextField label={t('about')} value={bio} onChangeText={setBio} multiline maxLength={2000} hint={t('aboutHint', { count: bio.length })} />
        </Card>
      )}

      {step === 3 && (
        <View style={styles.gap}>
          <Panel title={t('addDocument')}>
            <DocumentUploader key={docs.length} defaultType={hasLicense ? 'CNIC_COPY' : 'LICENSE'} />
          </Panel>
          <Panel title={t('uploadedList')}>
            {profile.isLoading ? <SkeletonList count={1} height={60} /> : <DocumentList documents={docs} />}
            <View style={styles.gapSm}>
              {(['LICENSE', 'CNIC_COPY', 'CERTIFICATE'] as const).map(type => {
                const done = docs.some(d => d.type === type);
                return (
                  <View key={type} style={styles.check}>
                    <View style={[styles.checkDot, done && styles.checkDotOn]}>{done && <Check size={12} color="#fff" strokeWidth={3} />}</View>
                    <Text variant="small" color={done ? ink[800] : colors.textMuted} style={styles.flex}>
                      {t(`checklist.${type}`)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Panel>
        </View>
      )}
    </Screen>
  );
}

/** Real sequence, so numbered: circles joined by a line, done steps ticked. */
function Progress({ step }: { step: number }) {
  const t = useT('caregiverB.onboarding');
  return (
    <View style={styles.progress} accessibilityLabel={t('progress')}>
      {STEPS.map((key, i) => {
        const done = i < step;
        const now = i === step;
        return (
          <View key={key} style={styles.stepCol}>
            <View style={styles.stepTrack}>
              <View style={[styles.stepLine, i === 0 && styles.hidden, i <= step && styles.stepLineOn]} />
              <View style={[styles.stepDot, done && styles.stepDone, now && styles.stepNow]}>
                {done ? (
                  <Check size={14} color="#fff" strokeWidth={3} />
                ) : (
                  <Text variant="caption" weight="bold" color={now ? '#fff' : ink[500]} align="center" numeric>
                    {String(i + 1)}
                  </Text>
                )}
              </View>
              <View style={[styles.stepLine, i === STEPS.length - 1 && styles.hidden, i < step && styles.stepLineOn]} />
            </View>
            <Text variant="caption" weight={now ? 'bold' : 'semibold'} color={i <= step ? brand[800] : ink[400]} align="center" numberOfLines={2}>
              {t(`steps.${key}`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  gapSm: { gap: space.sm },
  gap: { gap: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  progress: { flexDirection: 'row', paddingVertical: space.xs },
  stepCol: { flex: 1, alignItems: 'center', gap: 6 },
  stepTrack: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  stepLine: { flex: 1, height: 3, borderRadius: 2, backgroundColor: ink[200] },
  stepLineOn: { backgroundColor: brand[500] },
  hidden: { opacity: 0 },
  stepDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ink[100] },
  stepDone: { backgroundColor: brand[600] },
  stepNow: { backgroundColor: brand[700], borderWidth: 3, borderColor: brand[100], width: 34, height: 34, borderRadius: 17 },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  checkDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: ink[100], alignItems: 'center', justifyContent: 'center' },
  checkDotOn: { backgroundColor: feedback.success600 },
}));
