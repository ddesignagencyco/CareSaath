import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { meApi, profileApi } from '../../api/caregiver/api';
import { keys } from '../../api/caregiver/keys';
import type { UploadFile } from '../../api/http';
import type { Me, MyCaregiverProfile, Specialty } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Select, TextField } from '../../components/form';
import { BadgeCheck, Camera, Check, FileText, Pencil, ShieldCheck, Star, Stethoscope } from '../../components/icons';
import { Sheet } from '../../components/overlay';
import { ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Button, Chip, Touchable } from '../../components/ui';
import { useSettings, useT } from '../../i18n';
import { formatPkMobile } from '../../lib/phone';
import { useFmt, useLabels } from '../../i18n/format';
import { useAction, useQuery } from '../../lib/query';
import { accent, brand, colors, feedback, ink, radius, shadow, space, themed } from '../../theme';
import { DetailRow, Panel } from './components/Bits';
import { DocumentList, DocumentUploader } from './components/Documents';
import { FilePickerSheet, PhotoAvatar, SAMPLE_PHOTO } from './components/Files';
import { CITIES, digits, SPECIALTIES } from './components/helpers';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** CNIC comes back masked on GET; anything longer is ciphertext — never show it. */
const displayCnic = (cnic: string | null) => (cnic && cnic.length <= 15 ? cnic : '—');

export function CgProfileScreen() {
  const tm = useT('mobileCaregiver.profile');
  const profile = useQuery(keys.profile, profileApi.get);
  const me = useQuery(keys.me, meApi.get);

  if (profile.error || me.error) {
    return (
      <Screen title={tm('title')} back>
        <ErrorState error={profile.error ?? me.error} onRetry={() => (profile.error ? profile.refetch() : me.refetch())} />
      </Screen>
    );
  }
  if (!profile.data || !me.data) {
    return (
      <Screen title={tm('title')} back>
        <SkeletonList count={3} height={160} />
      </Screen>
    );
  }
  return <ProfileBody profile={profile.data} me={me.data} />;
}

/**
 * A profile to look at, not a form to fill: identity header, then summary
 * cards. Editing happens in a sheet so the page stays readable.
 */
function ProfileBody({ profile: p, me }: { profile: MyCaregiverProfile; me: Me }) {
  const t = useT('caregiverB.profile');
  const tf = useT('caregiverB.profile.form');
  const tm = useT('mobileCaregiver.profile');
  const f = useFmt();
  const L = useLabels();
  const name = me.fullName || t('fallbackName');
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);

  const photo = useQuery([...keys.profile, 'photo', p.photoKey], profileApi.photoUrl, { enabled: !!p.photoKey });
  const upload = useAction((file: UploadFile) => profileApi.uploadPhoto(file), { invalidate: [keys.profile], success: t('photoUpdated') });

  return (
    <Screen title={tm('title')} back>
      <View style={styles.identity}>
        {/* Camera badge sits outside the round, clipped press area. */}
        <View>
          <Touchable onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel={p.photoKey ? t('changePhoto') : t('addPhoto')} style={styles.photo}>
            <PhotoAvatar name={name} url={photo.data?.url} size={96} />
          </Touchable>
          <View style={styles.camera} pointerEvents="none">
            <Camera size={16} color="#fff" />
          </View>
        </View>
        <Text variant="h2" weight="extrabold" align="center" numberOfLines={1}>
          {name}
        </Text>
        <Text color={colors.textMuted} align="center">
          {L.specialty(p.specialty)}
        </Text>
        <Text variant="small" color={colors.textMuted} align="center" numeric>
          {formatPkMobile(me.phone)}
        </Text>
        <View style={styles.pills}>
          {p.verificationStatus === 'APPROVED' && (
            <View style={[styles.pill, styles.pillBrand]}>
              <BadgeCheck size={15} color={brand[700]} />
              <Text variant="caption" weight="bold" color={brand[800]} numberOfLines={1}>
                {t('verified')}
              </Text>
            </View>
          )}
          {p.ratingCount > 0 && (
            <View style={[styles.pill, styles.pillAccent]}>
              <Star size={14} color={accent[600]} fill={accent[500]} />
              <Text variant="caption" weight="bold" color={accent[700]} numberOfLines={1}>
                {t('rating', { rating: Number(p.ratingAverage).toFixed(1), count: p.ratingCount })}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Panel
        icon={Stethoscope}
        tone="teal"
        title={tf('title')}
        description={tf('description')}>
        <DetailRow label={tf('fullName')} value={name} />
        <DetailRow label={tf('specialty')} value={L.specialty(p.specialty)} />
        <DetailRow label={tf('rate')} value={tm('perVisit', { amount: f.money(p.ratePerVisit) })} />
        <DetailRow label={tf('years')} value={p.experienceYears === null ? tm('notAdded') : tm('yearsValue', { n: p.experienceYears })} />
        <DetailRow label={tf('cities')} value={p.serviceArea.cities.length ? f.list(p.serviceArea.cities) : tm('notAdded')} />
        <View style={styles.about}>
          <Text variant="small" color={colors.textMuted}>
            {tf('about')}
          </Text>
          <Text variant="small" color={p.bio ? ink[800] : ink[400]}>
            {p.bio || tm('notAdded')}
          </Text>
        </View>
        {/* Below the details, not in the heading row, so it never squeezes the title (Urdu). */}
        <Button label={tm('edit')} icon={Pencil} variant="secondary" block onPress={() => setEditing(true)} />
      </Panel>

      <Panel icon={ShieldCheck} tone="mint" title={t('credentials.title')} description={t('credentials.description')}>
        <DetailRow label={t('credentials.license')} value={p.licenseNumber} ltr />
        <DetailRow label={t('credentials.body')} value={L.licenseBody(p.licenseBody)} />
        <DetailRow label={t('credentials.cnic')} value={displayCnic(p.cnic)} ltr />
        <DetailRow label={t('credentials.commission')} value={p.commissionRate ? t('credentials.commissionValue', { pct: Number(p.commissionRate.percentage) }) : '—'} />
        <DetailRow label={t('credentials.approved')} value={f.date(p.approvedAt)} />
        <DetailRow label={t('credentials.reverify')} value={f.date(p.reverifyDueAt)} />
      </Panel>

      <Panel icon={FileText} tone="marigold" title={t('documents')}>
        <DocumentList documents={p.documents} />
        <View style={styles.uploader}>
          <Text variant="small" weight="semibold" color={ink[700]}>
            {t('uploadNew')}
          </Text>
          <DocumentUploader key={p.documents.length} defaultType="CERTIFICATE" />
        </View>
      </Panel>

      {editing && <EditSheet profile={p} me={me} onClose={() => setEditing(false)} />}

      <FilePickerSheet
        visible={picking}
        title={p.photoKey ? t('changePhoto') : t('addPhoto')}
        sample={SAMPLE_PHOTO}
        onClose={() => setPicking(false)}
        onPick={file => {
          if (!PHOTO_TYPES.includes(file.type) || file.size > 10 * 1024 * 1024) return;
          upload.run(file);
        }}
      />
    </Screen>
  );
}

/** Profile details form in a sheet; mounted fresh each time it opens. */
function EditSheet({ profile: p, me, onClose }: { profile: MyCaregiverProfile; me: Me; onClose: () => void }) {
  const tf = useT('caregiverB.profile.form');
  const tm = useT('mobileCaregiver.profile');
  const L = useLabels();
  const tl = useT('common.language');
  const { reloadMe } = useAuth();
  const { locale, setLocale } = useSettings();

  const [fullName, setFullName] = useState(me.fullName);
  const [language, setLanguage] = useState<'en' | 'ur'>(locale);
  const [specialty, setSpecialty] = useState<Specialty>(p.specialty);
  const [rate, setRate] = useState(String(p.ratePerVisit / 100));
  const [years, setYears] = useState(p.experienceYears === null ? '' : String(p.experienceYears));
  const [cities, setCities] = useState<string[]>(p.serviceArea.cities);
  const [bio, setBio] = useState(p.bio ?? '');
  const [touched, setTouched] = useState(false);

  const rateNum = Number(rate);
  const yearsNum = years === '' ? undefined : Number(years);
  const errors = {
    name: fullName.trim().length < 2 ? tf('errors.name') : null,
    rate: !rate || rateNum < 10 ? tf('errors.rate') : null,
    years: yearsNum !== undefined && (yearsNum < 0 || yearsNum > 60) ? tf('errors.years') : null,
    cities: cities.length === 0 ? tf('errors.cities') : null,
  };
  const valid = Object.values(errors).every(e => !e);
  const err = (k: keyof typeof errors) => (touched ? errors[k] : null);

  const save = useAction(
    async () => {
      const nameChanged = fullName.trim() !== me.fullName;
      if (nameChanged || language !== locale) {
        await meApi.update({ ...(nameChanged ? { fullName: fullName.trim() } : {}), ...(language !== locale ? { preferredLanguage: language === 'ur' ? 'UR' : 'EN' } : {}) });
      }
      await profileApi.update({
        specialty,
        ratePerVisit: Math.round(rateNum * 100),
        serviceCities: cities,
        bio: bio.trim(),
        ...(yearsNum !== undefined ? { experienceYears: yearsNum } : {}),
      });
    },
    {
      invalidate: [keys.profile, keys.me],
      success: tf('saved'),
      onSuccess: () => {
        if (language !== locale) setLocale(language);
        reloadMe().catch(() => undefined);
        onClose();
      },
    },
  );

  return (
    <Sheet
      visible
      onClose={onClose}
      title={tm('editTitle')}
      footer={
        <Button
          label={tf('save')}
          size="lg"
          block
          loading={save.isPending}
          onPress={() => {
            setTouched(true);
            if (valid) save.run(undefined);
          }}
        />
      }>
      <TextField label={tf('fullName')} value={fullName} onChangeText={setFullName} maxLength={120} error={err('name')} autoCapitalize="words" />
      <Select<Specialty>
        label={tf('specialty')}
        hint={tf('specialtyHint')}
        value={specialty}
        onChange={setSpecialty}
        options={SPECIALTIES.map(v => ({ value: v, label: L.specialty(v), description: L.specialtyHint(v) }))}
      />
      <View style={styles.twoCol}>
        <View style={styles.flex}>
          <TextField label={tf('rate')} prefix="Rs" value={rate} onChangeText={v => setRate(digits(v, 6))} keyboardType="number-pad" ltr error={err('rate')} />
        </View>
        <View style={styles.flex}>
          <TextField label={tf('years')} value={years} onChangeText={v => setYears(digits(v, 2))} keyboardType="number-pad" ltr error={err('years')} />
        </View>
      </View>
      <View style={styles.gapSm}>
        <Text variant="small" weight="semibold" color={ink[700]}>
          {tf('cities')}
        </Text>
        <View style={styles.chips}>
          {CITIES.map(c => {
            const on = cities.includes(c);
            return <Chip key={c} label={c} selected={on} icon={on ? Check : undefined} onPress={() => setCities(cs => (on ? cs.filter(x => x !== c) : [...cs, c]))} />;
          })}
        </View>
        {!!err('cities') && (
          <Text variant="small" color={feedback.danger700}>
            {err('cities')}
          </Text>
        )}
      </View>
      <TextField label={tf('about')} value={bio} onChangeText={setBio} multiline maxLength={2000} hint={tf('aboutHint', { count: bio.length })} />
      <Select<'en' | 'ur'>
        label={tl('appLanguage')}
        hint={tl('hint')}
        value={language}
        onChange={setLanguage}
        variant="chips"
        options={[
          { value: 'en', label: tl('en') },
          { value: 'ur', label: tl('ur') },
        ]}
      />
    </Sheet>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  gapSm: { gap: space.sm },
  identity: {
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: radius.xl + 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: brand[100],
    ...shadow.card,
  },
  photo: { borderRadius: 48, marginBottom: space.sm },
  camera: {
    position: 'absolute',
    bottom: space.sm - 2,
    end: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: brand[700],
    borderWidth: 3,
    borderColor: colors.ring,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginTop: space.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill },
  pillBrand: { backgroundColor: brand[50] },
  pillAccent: { backgroundColor: accent[50] },
  about: { gap: 2, paddingTop: space.xs },
  twoCol: { flexDirection: 'row', gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  uploader: { gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink[200], paddingTop: space.lg },
}));
