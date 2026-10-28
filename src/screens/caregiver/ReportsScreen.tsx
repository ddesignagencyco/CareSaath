import React from 'react';
import { StyleSheet, View } from 'react-native';
import { disputesApi, safetyApi } from '../../api/caregiver/api';
import { keys } from '../../api/caregiver/keys';
import type { DisputeStatus, IncidentPriority, IncidentStatus } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ShieldCheck } from '../../components/icons';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Badge, Touchable, type Tone } from '../../components/ui';
import { useT } from '../../i18n';
import { useFmt, useLabels } from '../../i18n/format';
import { useQuery } from '../../lib/query';
import type { CaregiverScreen } from '../../navigation/types';
import { brand, colors, ink, space, themed } from '../../theme';
import { Panel } from './components/Bits';
import { Scale } from './components/icons';

const PRIORITY: Record<IncidentPriority, Tone> = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'danger' };
const INCIDENT: Record<IncidentStatus, Tone> = { OPEN: 'danger', IN_REVIEW: 'warning', RESOLVED: 'success' };
const DISPUTE: Record<DisputeStatus, Tone> = { OPEN: 'warning', RESOLVED: 'success' };

/** Safety reports sent (FR-CG10) and disputes about this caregiver's visits. */
export function ReportsScreen({ navigation }: CaregiverScreen<'Reports'>) {
  const t = useT('caregiverA.reports');
  const f = useFmt();
  const L = useLabels();
  const { me } = useAuth();
  const reports = useQuery(keys.safety, safetyApi.list);
  const disputes = useQuery(keys.disputes, disputesApi.list);

  const openVisit = (id: string) => navigation.navigate('CgVisitDetail', { id });

  return (
    <Screen
      title={t('title')}
      back
      refreshing={(reports.isFetching && !reports.isLoading) || (disputes.isFetching && !disputes.isLoading)}
      onRefresh={() => {
        reports.refetch();
        disputes.refetch();
      }}>
      <Text color={colors.textMuted}>{t('description')}</Text>

      <Panel title={t('safetyReports')}>
        {reports.error ? (
          <ErrorState error={reports.error} onRetry={reports.refetch} />
        ) : reports.isLoading ? (
          <SkeletonList count={2} height={72} />
        ) : (reports.data ?? []).length === 0 ? (
          <EmptyState icon={ShieldCheck} title={t('noReports')} text={t('noReportsHint')} />
        ) : (
          reports.data!.map(r => (
            <View key={r.id} style={styles.item}>
              <View style={styles.badges}>
                <Badge tone={INCIDENT[r.status]} label={L.incidentStatus(r.status)} />
                <Badge tone={PRIORITY[r.priority]} label={L.priority(r.priority)} />
                <Badge label={L.incidentSource(r.source)} />
              </View>
              <Text variant="small">{r.description}</Text>
              <View style={styles.meta}>
                <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.flex}>
                  {f.dateTime(r.createdAt)}
                </Text>
                {!!r.visitId && <ViewVisit label={t('viewVisit')} onPress={() => openVisit(r.visitId!)} />}
              </View>
            </View>
          ))
        )}
      </Panel>

      <Panel title={t('disputes')}>
        {disputes.error ? (
          <ErrorState error={disputes.error} onRetry={disputes.refetch} />
        ) : disputes.isLoading ? (
          <SkeletonList count={2} height={72} />
        ) : (disputes.data ?? []).length === 0 ? (
          <EmptyState icon={Scale} title={t('noDisputes')} />
        ) : (
          disputes.data!.map(d => (
            <View key={d.id} style={styles.item}>
              <View style={styles.badges}>
                <Badge tone={DISPUTE[d.status]} label={L.dispute(d.status)} />
                <Badge label={d.raisedById === me?.id ? t('raisedByYou') : t('raisedByFamily')} />
              </View>
              <Text variant="small">{d.description}</Text>
              {!!d.resolutionNote && (
                <Text variant="small" color={colors.textMuted}>
                  {d.resolutionNote}
                </Text>
              )}
              <View style={styles.meta}>
                <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.flex}>
                  {f.dateTime(d.createdAt)}
                </Text>
                <ViewVisit label={t('viewVisit')} onPress={() => openVisit(d.visitId)} />
              </View>
            </View>
          ))
        )}
      </Panel>
    </Screen>
  );
}

function ViewVisit({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="link" style={styles.link}>
      <Text variant="small" weight="bold" color={brand[700]} numberOfLines={1}>
        {label}
      </Text>
    </Touchable>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  item: { gap: space.sm, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink[200] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs, borderRadius: 8, overflow: 'hidden' },
}));
