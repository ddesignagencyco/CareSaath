import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CustomerVisitDetail, PublicCaregiver, VisitStatus, VisitStatusHistory } from '../../../api/types';
import { Check, Navigation } from '../../../components/icons';
import { Text } from '../../../components/Text';
import { Avatar, DirChevron, Touchable } from '../../../components/ui';
import { useT } from '../../../i18n';
import { useFmt, useLabels } from '../../../i18n/format';
import { accentFixed, brandFixed, radius, shadow, space, themed } from '../../../theme';

/*
 * The app's one loud element: a deep-teal surface with a marigold line that
 * fills as the visit moves Confirmed → On the way → Arrived → Care → Done.
 * Marigold appears nowhere else at this strength, so "live" always reads.
 */

const TRACK: { key: 'confirmed' | 'onTheWay' | 'arrived' | 'care' | 'done'; statuses: VisitStatus[] }[] = [
  { key: 'confirmed', statuses: ['CONFIRMED'] },
  { key: 'onTheWay', statuses: ['EN_ROUTE'] },
  { key: 'arrived', statuses: ['CHECKED_IN'] },
  { key: 'care', statuses: ['IN_PROGRESS', 'CHECKED_OUT'] },
  { key: 'done', statuses: ['COMPLETED'] },
];

export const trackIndex = (status: VisitStatus) => TRACK.findIndex(t => t.statuses.includes(status));

function reachedAt(history: VisitStatusHistory[], statuses: VisitStatus[]) {
  return history.find(h => statuses.includes(h.toStatus))?.at;
}

/** Five-step tracker for the visit page; renders on a dark surface. */
export function VisitTracker({ visit }: { visit: CustomerVisitDetail }) {
  const tr = useT('customerB.tracker');
  const f = useFmt();
  const current = trackIndex(visit.status);
  const completed = visit.status === 'COMPLETED';
  if (current < 0) return null;
  return (
    <View style={styles.track} accessibilityLabel={`${tr('label')}: ${tr(TRACK[current].key)}`}>
      {TRACK.map((step, i) => {
        const done = i < current || completed;
        const now = i === current && !completed;
        const at = i === 0 ? null : reachedAt(visit.statusHistory, step.statuses);
        return (
          <View key={step.key} style={styles.step}>
            <View style={styles.nodeRow}>
              <View style={[styles.line, i === 0 && styles.hidden, (done || now) && styles.lineOn]} />
              <View style={[styles.node, done && styles.nodeDone, now && styles.nodeNow]}>
                {done ? <Check size={14} color={brandFixed[950]} strokeWidth={3} /> : null}
              </View>
              <View style={[styles.line, i === TRACK.length - 1 && styles.hidden, done && i < current && styles.lineOn, completed && styles.lineOn]} />
            </View>
            <Text variant="caption" weight={now ? 'bold' : 'semibold'} color={done || now ? '#fff' : brandFixed[300]} align="center" numberOfLines={1}>
              {tr(step.key)}
            </Text>
            {!!at && (
              <Text variant="caption" color={brandFixed[200]} align="center" tabular numberOfLines={1} style={styles.time}>
                {f.time(`${new Date(at).getHours()}:${String(new Date(at).getMinutes()).padStart(2, '0')}`)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Compact progress bar for the Home card. */
function MiniTrack({ status }: { status: VisitStatus }) {
  const current = trackIndex(status);
  return (
    <View style={styles.mini}>
      {TRACK.map((s, i) => (
        <View key={s.key} style={[styles.miniSeg, i <= current && styles.miniOn]} />
      ))}
    </View>
  );
}

/** Home: the visit happening now, with the caregiver's face and name (SRS §9.2). */
export function LiveVisitCard({
  status,
  caregiver,
  patientName,
  onPress,
}: {
  status: VisitStatus;
  caregiver?: PublicCaregiver;
  patientName: string;
  onPress: () => void;
}) {
  const t = useT('customerA.home');
  const L = useLabels();
  const name = caregiver?.user.fullName ?? t('yourCaregiver');
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${L.visitCustomer(status)}. ${name}. ${t('track')}`} rippleColor="rgba(255,255,255,0.12)" style={styles.live}>
      <View style={styles.liveHead}>
        <Text variant="small" weight="bold" color={accentFixed[200]} style={styles.flex} numberOfLines={1}>
          {L.visitCustomer(status)}
        </Text>
        <Navigation size={18} color={accentFixed[400]} />
      </View>
      <View style={styles.liveBody}>
        <Avatar name={name} uri={caregiver?.photoUrl} size={52} />
        <View style={styles.flex}>
          <Text variant="lead" weight="bold" color="#fff" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="small" color={brandFixed[200]} numberOfLines={1}>
            {caregiver ? `${L.specialty(caregiver.specialty)} · ${patientName}` : patientName}
          </Text>
        </View>
      </View>
      <MiniTrack status={status} />
      <View style={styles.liveFoot}>
        <Text weight="bold" color={accentFixed[400]}>
          {t('track')}
        </Text>
        <DirChevron color={accentFixed[400]} />
      </View>
    </Touchable>
  );
}

const NODE = 26;

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  hidden: { opacity: 0 },
  track: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  nodeRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
  lineOn: { backgroundColor: accentFixed[400] },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', backgroundColor: brandFixed[900] },
  nodeDone: { backgroundColor: accentFixed[400], borderColor: accentFixed[400] },
  nodeNow: { borderColor: accentFixed[400], borderWidth: 2.5 },
  time: { marginTop: -4 },
  mini: { flexDirection: 'row', gap: 4 },
  miniSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  miniOn: { backgroundColor: accentFixed[400] },
  live: { backgroundColor: brandFixed[900], borderRadius: radius.xl, padding: space.lg, gap: space.md, overflow: 'hidden', ...shadow.pop },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  liveBody: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  liveFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
}));
