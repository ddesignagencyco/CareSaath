import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { patientsApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import type { PatientProfile } from '../../api/types';
import { HeartPulse, Pencil, Plus, Trash } from '../../components/icons';
import { ConfirmSheet, useToast } from '../../components/overlay';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Avatar, Button, Card, IconButton } from '../../components/ui';
import { useT } from '../../i18n';
import { useFmt, useLabels } from '../../i18n/format';
import { useAction, useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { brand, colors, feedback, ink, radius, space, themed } from '../../theme';
import { isUnreadableMedical } from './components/bits';

/** FR-C2: the people this account books care for. */
export function PatientsScreen({ navigation }: CustomerScreen<'Patients'>) {
  const t = useT('customerB.patients');
  const patients = useQuery(keys.patients, () => patientsApi.list());
  const [removing, setRemoving] = useState<PatientProfile | null>(null);
  const toast = useToast();

  const remove = useAction((p: PatientProfile) => patientsApi.remove(p.id), {
    invalidate: [keys.patients],
    success: (_r, p) => t('removed', { name: p.name }),
    onSuccess: () => setRemoving(null),
    onError: err => {
      const name = removing?.name ?? '';
      setRemoving(null);
      // The API refuses once a patient has bookings, to keep records for audit.
      if (err.message.startsWith('Patient has bookings')) {
        toast.error(t('hasBookings', { name }));
        return true;
      }
    },
  });

  return (
    <Screen
      title={t('title')}
      back
      refreshing={patients.isFetching && !patients.isLoading}
      onRefresh={patients.refetch}
      footer={<Button label={t('add')} icon={Plus} size="lg" block onPress={() => navigation.navigate('PatientForm')} />}>
      <Text color={colors.textMuted}>{t('description')}</Text>
      {patients.error && !patients.data ? (
        <ErrorState error={patients.error} onRetry={patients.refetch} />
      ) : !patients.data ? (
        <SkeletonList count={2} height={150} />
      ) : patients.data.length === 0 ? (
        <EmptyState title={t('emptyTitle')} text={t('emptyHint')} />
      ) : (
        patients.data.map(p => <PatientCard key={p.id} p={p} onEdit={() => navigation.navigate('PatientForm', { id: p.id })} onRemove={() => setRemoving(p)} />)
      )}
      <ConfirmSheet
        visible={!!removing}
        title={removing ? t('removeConfirmTitle', { name: removing.name }) : ''}
        body={t('removeConfirmBody')}
        confirmLabel={t('removeConfirm')}
        danger
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.run(removing)}
      />
    </Screen>
  );
}

function PatientCard({ p, onEdit, onRemove }: { p: PatientProfile; onEdit: () => void; onRemove: () => void }) {
  const t = useT('customerB.patients');
  const f = useFmt();
  const L = useLabels();
  return (
    <Card>
      <View style={styles.top}>
        <Avatar name={p.name} size={52} />
        <View style={styles.flex}>
          <Text weight="bold" numberOfLines={1}>
            {p.name}
          </Text>
          <Text variant="small" color={colors.textMuted} numberOfLines={1}>
            {L.patientLine(p, f.age(p.dateOfBirth))}
          </Text>
        </View>
        <IconButton icon={Pencil} label={t('editLabel', { name: p.name })} onPress={onEdit} size={20} />
        <IconButton icon={Trash} label={t('removeLabel', { name: p.name })} onPress={onRemove} size={20} color={feedback.danger600} />
      </View>
      <View style={styles.medical}>
        <View style={styles.medHead}>
          <HeartPulse size={14} color={brand[800]} />
          <Text variant="caption" weight="bold" color={brand[800]}>
            {t('medical')}
          </Text>
        </View>
        {isUnreadableMedical(p.medicalContext) ? (
          <Text variant="small" color={colors.textMuted}>
            {t('medicalUnavailable')}
          </Text>
        ) : (
          <Text variant="small" color={ink[700]}>
            {p.medicalContext || t('notAdded')}
          </Text>
        )}
      </View>
    </Card>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  medical: { marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: brand[50], gap: 4 },
  medHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
}));
