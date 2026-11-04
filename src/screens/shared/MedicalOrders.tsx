import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { MedicalOrder } from '../../api/types';
import { ClipboardList, Download, FileText } from '../../components/icons';
import { Text } from '../../components/Text';
import { Button } from '../../components/ui';
import { IconLine } from '../customer/components/bits';
import { useFmt } from '../../i18n/format';
import { useT } from '../../i18n';
import { ink, radius, space, themed } from '../../theme';

/**
 * Read-only render of a doctor's medical orders (diagnosis, prescription, lab
 * tests) for a visit, shared by the customer visit detail and the caregiver's
 * doctor-orders panel. Pass `onDownload` to show a per-order "Download PDF"
 * button (the branded CareSaath prescription letterhead).
 */
export function MedicalOrdersView({
  orders,
  onDownload,
  downloadingId,
}: {
  orders: MedicalOrder[];
  onDownload?: (orderId: string) => void;
  downloadingId?: string | null;
}) {
  const t = useT('shared.medicalOrders');
  const f = useFmt();
  if (orders.length === 0) return null;
  return (
    <View style={styles.list}>
      {orders.map(o => (
        <View key={o.id} style={styles.order}>
          <View style={styles.head}>
            <Text variant="caption" color={ink[500]} style={styles.flex} numberOfLines={1}>
              {t('recordedOn', { date: f.dateTime(o.createdAt) })}
            </Text>
            {onDownload && (
              <Button label={t('downloadPdf')} icon={Download} variant="secondary" loading={downloadingId === o.id} onPress={() => onDownload(o.id)} />
            )}
          </View>

          {!!o.diagnosis && (
            <View style={styles.section}>
              <IconLine icon={ClipboardList} text={t('diagnosis')} color={ink[500]} />
              <Text variant="small" color={ink[800]}>
                {o.diagnosis}
              </Text>
            </View>
          )}

          {o.medicines.length > 0 && (
            <View style={styles.section}>
              <IconLine icon={FileText} text={t('medicines')} color={ink[500]} />
              {o.medicines.map((m, i) => (
                <View key={i} style={styles.item}>
                  <Text variant="small" weight="semibold">
                    {m.name}
                  </Text>
                  {!!(m.dosage || m.frequency || m.duration) && (
                    <Text variant="caption" color={ink[600]}>
                      {[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  {!!m.instructions && (
                    <Text variant="caption" color={ink[500]}>
                      {m.instructions}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {o.labTests.length > 0 && (
            <View style={styles.section}>
              <IconLine icon={FileText} text={t('labTests')} color={ink[500]} />
              {o.labTests.map((lt, i) => (
                <View key={i} style={styles.item}>
                  <Text variant="small" weight="semibold">
                    {lt.name}
                  </Text>
                  {!!lt.instructions && (
                    <Text variant="caption" color={ink[500]}>
                      {lt.instructions}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    list: { gap: space.lg },
    order: { gap: space.md },
    head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    section: { gap: space.xs },
    item: { gap: 2, padding: space.md, borderRadius: radius.md, backgroundColor: ink[25], borderWidth: 1, borderColor: ink[100] },
  }),
);
