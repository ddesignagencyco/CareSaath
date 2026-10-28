import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { patientsApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import type { PatientProfile, PatientRelation } from '../../api/types';
import { Select, TextField } from '../../components/form';
import { ErrorState, Screen, Skeleton } from '../../components/screen';
import { Text } from '../../components/Text';
import { Button, Card, Segmented } from '../../components/ui';
import { useT } from '../../i18n';
import { useLabels } from '../../i18n/format';
import { useAction, useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { colors, space } from '../../theme';
import { isUnreadableMedical, todayKey } from './components/bits';
import { DobPicker, dobIncomplete } from './components/dates';

const GENDERS = ['Female', 'Male', 'Other'] as const;

/** Add or edit a patient (loaded fresh with GET /customer/patients/:id). */
export function PatientFormScreen({
  route,
  navigation,
}: CustomerScreen<'PatientForm'>) {
  const id = route.params?.id;
  const t = useT('customerB.patientForm');
  const q = useQuery(
    [...keys.patients, 'detail', id],
    () => patientsApi.get(id!),
    { enabled: !!id, refetchOnFocus: false },
  );
  if (!id)
    return <PatientForm patient={null} onDone={() => navigation.goBack()} />;
  if (q.data)
    return (
      <PatientForm
        key={q.data.updatedAt}
        patient={q.data}
        onDone={() => navigation.goBack()}
      />
    );
  return (
    <Screen title={t('loadingTitle')} back>
      {q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <Skeleton height={320} />
      )}
    </Screen>
  );
}

function PatientForm({
  patient,
  onDone,
}: {
  patient: PatientProfile | null;
  onDone: () => void;
}) {
  const t = useT('customerB.patientForm');
  const tc = useT('common.actions');
  const L = useLabels();
  const [name, setName] = useState(patient?.name ?? '');
  const [relationship, setRelationship] = useState<PatientRelation>(
    patient?.relationship ?? 'FAMILY_MEMBER',
  );
  const [dob, setDob] = useState(patient?.dateOfBirth?.slice(0, 10) ?? '');
  const [gender, setGender] = useState<string | null>(patient?.gender ?? null);
  // An undecryptable value (raw "iv:tag:ciphertext") is never prefilled or saved back.
  const unreadable = isUnreadableMedical(patient?.medicalContext);
  const initialContext = unreadable ? '' : patient?.medicalContext ?? '';
  const [context, setContext] = useState(initialContext);
  const dobError =
    dob && !dobIncomplete(dob) && dob > todayKey() ? t('dobFuture') : null;
  const valid = name.trim().length >= 1 && !dobError && !dobIncomplete(dob);

  const save = useAction(
    () => {
      const dto = {
        name: name.trim(),
        relationship,
        dateOfBirth: dob || undefined,
        gender: gender ?? undefined,
        medicalContext: context.trim() || undefined,
      };
      if (!patient) return patientsApi.create(dto);
      // PATCH: "" clears a readable note; leave an unreadable one untouched unless replaced.
      const medicalContext = context.trim()
        ? context.trim()
        : unreadable || !initialContext
        ? undefined
        : '';
      return patientsApi.update(patient.id, { ...dto, medicalContext });
    },
    {
      invalidate: [keys.patients],
      success: patient ? t('updated') : t('added'),
      onSuccess: onDone,
    },
  );

  return (
    <Screen
      title={patient ? t('editTitle', { name: patient.name }) : t('addTitle')}
      back
      footer={
        <Button
          label={patient ? tc('save') : t('addSubmit')}
          size="lg"
          block
          disabled={!valid}
          loading={save.isPending}
          onPress={() => save.run(undefined)}
        />
      }
    >
      <Text color={colors.textMuted}>{t('description')}</Text>
      <Card style={styles.card}>
        <Text weight="bold" accessibilityRole="header">
          {t('whoFor')}
        </Text>
        <Segmented
          value={relationship}
          onChange={setRelationship}
          options={[
            { value: 'FAMILY_MEMBER', label: t('familyMember') },
            { value: 'SELF', label: t('myself') },
          ]}
        />
        <TextField
          label={t('fullName')}
          value={name}
          onChangeText={setName}
          maxLength={120}
          placeholder={t('fullNamePlaceholder')}
          autoCapitalize="words"
        />
        <DobPicker value={dob} onChange={setDob} error={dobError} />
        <Select
          label={t('gender')}
          value={gender}
          onChange={setGender}
          options={GENDERS.map(g => ({ value: g, label: L.gender(g) }))}
          variant="chips"
          optional
        />
      </Card>
      <Card style={styles.card}>
        <TextField
          label={t('medical')}
          value={context}
          onChangeText={setContext}
          maxLength={4000}
          multiline
          placeholder={t('medicalPlaceholder')}
          hint={
            unreadable && !context
              ? t('medicalUnreadable')
              : t('medicalHint', { count: context.length })
          }
          optional
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg },
});
