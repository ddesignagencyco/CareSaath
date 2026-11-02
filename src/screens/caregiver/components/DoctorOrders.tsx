import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { medicalOrdersApi } from '../../../api/caregiver/api';
import { keys } from '../../../api/caregiver/keys';
import type { LabTest, Medicine } from '../../../api/types';
import { Plus, Stethoscope, X } from '../../../components/icons';
import { TextField } from '../../../components/form';
import { useToast } from '../../../components/overlay';
import { Text } from '../../../components/Text';
import { Button, IconButton } from '../../../components/ui';
import { useT } from '../../../i18n';
import { useAction, useApiErrorText, useQuery } from '../../../lib/query';
import { colors, ink, radius, space, themed } from '../../../theme';
import { MedicalOrdersView } from '../../shared/MedicalOrders';
import { Panel } from './Bits';

/**
 * Doctor-only panel on the visit detail: prior medical orders + a form to record
 * a new diagnosis / prescription / lab-test order. Rendered only for a DOCTOR
 * visit, so the save always targets a doctor profile.
 */
export function DoctorOrders({ visitId }: { visitId: string }) {
  const t = useT('caregiverB.visit.medicalOrders');
  const toast = useToast();
  const apiError = useApiErrorText();
  const key = [...keys.visits, 'medical-orders', visitId] as const;
  const orders = useQuery(key, () => medicalOrdersApi.list(visitId));

  const [diagnosis, setDiagnosis] = useState('');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = (orderId: string) => {
    setDownloadingId(orderId);
    medicalOrdersApi
      .openPdf(visitId, orderId)
      .catch(e => toast.error(apiError(e)))
      .finally(() => setDownloadingId(null));
  };

  const meds = medicines.map(m => ({ ...m, name: m.name.trim() })).filter(m => m.name);
  const labs = labTests.map(l => ({ ...l, name: l.name.trim() })).filter(l => l.name);
  const diag = diagnosis.trim();
  const canSave = !!diag || meds.length > 0 || labs.length > 0;

  const save = useAction(
    () => medicalOrdersApi.create(visitId, { diagnosis: diag || undefined, medicines: meds.length ? meds : undefined, labTests: labs.length ? labs : undefined }),
    {
      invalidate: [key],
      success: t('saved'),
      onSuccess: () => {
        setDiagnosis('');
        setMedicines([]);
        setLabTests([]);
      },
    },
  );

  const setMed = (i: number, patch: Partial<Medicine>) => setMedicines(m => m.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setLab = (i: number, patch: Partial<LabTest>) => setLabTests(l => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Panel icon={Stethoscope} tone="mint" title={t('title')}>
      {!!orders.data?.length && <MedicalOrdersView orders={orders.data} onDownload={download} downloadingId={downloadingId} />}

      <View style={styles.form}>
        <Text weight="bold">{t('addTitle')}</Text>
        <Text variant="small" color={colors.textMuted}>
          {t('hint')}
        </Text>
        <TextField label={t('diagnosis')} value={diagnosis} onChangeText={setDiagnosis} placeholder={t('diagnosisPlaceholder')} multiline maxLength={1000} />

        <Text variant="small" weight="semibold" color={ink[700]}>
          {t('medicines')}
        </Text>
        {medicines.map((m, i) => (
          <View key={i} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <TextField label={t('medName')} value={m.name} onChangeText={v => setMed(i, { name: v })} />
              </View>
              <IconButton icon={X} label={t('remove')} onPress={() => setMedicines(x => x.filter((_, j) => j !== i))} />
            </View>
            <View style={styles.three}>
              <View style={styles.flex}>
                <TextField label={t('dosage')} value={m.dosage ?? ''} onChangeText={v => setMed(i, { dosage: v })} />
              </View>
              <View style={styles.flex}>
                <TextField label={t('frequency')} value={m.frequency ?? ''} onChangeText={v => setMed(i, { frequency: v })} />
              </View>
              <View style={styles.flex}>
                <TextField label={t('duration')} value={m.duration ?? ''} onChangeText={v => setMed(i, { duration: v })} />
              </View>
            </View>
            <TextField label={t('instructions')} value={m.instructions ?? ''} onChangeText={v => setMed(i, { instructions: v })} />
          </View>
        ))}
        <Button label={t('addMedicine')} icon={Plus} variant="secondary" onPress={() => setMedicines(m => [...m, { name: '' }])} />

        <Text variant="small" weight="semibold" color={ink[700]}>
          {t('labTests')}
        </Text>
        {labTests.map((l, i) => (
          <View key={i} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <TextField label={t('labName')} value={l.name} onChangeText={v => setLab(i, { name: v })} />
              </View>
              <IconButton icon={X} label={t('remove')} onPress={() => setLabTests(x => x.filter((_, j) => j !== i))} />
            </View>
            <TextField label={t('instructions')} value={l.instructions ?? ''} onChangeText={v => setLab(i, { instructions: v })} />
          </View>
        ))}
        <Button label={t('addLabTest')} icon={Plus} variant="secondary" onPress={() => setLabTests(l => [...l, { name: '' }])} />

        <Button label={t('save')} loading={save.isPending} disabled={!canSave} onPress={() => save.run(undefined)} block />
      </View>
    </Panel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    form: { gap: space.md, marginTop: space.md },
    card: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: ink[25], borderWidth: 1, borderColor: ink[100] },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
    three: { flexDirection: 'row', gap: space.xs },
  }),
);
