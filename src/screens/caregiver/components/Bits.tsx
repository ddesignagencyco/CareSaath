import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { CaregiverVisitListItem } from '../../../api/types';
import { Clock, MapPin, Repeat, Timer, type IconType } from '../../../components/icons';
import { Text } from '../../../components/Text';
import { Badge, Card, DateBlock, DirChevron, IconTile, Touchable, type TileTone } from '../../../components/ui';
import { useSettings, useT } from '../../../i18n';
import { useFmt, useLabels } from '../../../i18n/format';
import { accent, brand, colors, feedback, ink, radius, shadow, space, themed } from '../../../theme';
import { ACTIVE_STATUSES, VISIT_TONE, dateBlockLabel, dayKey, useNow, visitStart } from './helpers';

/** Section card with a heading row; `icon` adds a toned tile so sections are easy to tell apart. */
export function Panel({
  title,
  description,
  action,
  icon,
  tone = 'teal',
  children,
  style,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: IconType;
  tone?: TileTone;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card style={[styles.panel, style]}>
      {(!!title || !!action) && (
        <View style={styles.panelHead}>
          {icon && <IconTile icon={icon} tone={tone} size={40} />}
          <View style={styles.flex}>
            {!!title && (
              <Text variant="lead" weight="bold" accessibilityRole="header">
                {title}
              </Text>
            )}
            {!!description && (
              <Text variant="small" color={colors.textMuted}>
                {description}
              </Text>
            )}
          </View>
          {action}
        </View>
      )}
      {children}
    </Card>
  );
}

/** Label on the start side, value on the end side. */
export function DetailRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  const { isRTL } = useSettings();
  return (
    <View style={styles.detail}>
      <Text variant="small" color={colors.textMuted} style={styles.detailLabel}>
        {label}
      </Text>
      <Text variant="small" weight="semibold" align={isRTL ? 'left' : 'right'} style={[styles.flex, ltr && styles.ltr]}>
        {value}
      </Text>
    </View>
  );
}

/** Time left to respond to a booking request (booking.respondBy). */
export function RespondCountdown({ respondBy }: { respondBy: string }) {
  const now = useNow(1000);
  const t = useT('shared.countdown');
  const left = new Date(respondBy).getTime() - now;
  const expired = left <= 0;
  const mins = Math.floor(Math.max(0, left) / 60_000);
  const secs = Math.floor((Math.max(0, left) % 60_000) / 1000);
  const urgent = !expired && left < 15 * 60_000;
  const fg = expired ? ink[600] : urgent ? feedback.danger700 : accent[700];
  const bg = expired ? ink[100] : urgent ? feedback.danger50 : accent[50];
  const label = expired
    ? t('passed')
    : t('left', { time: mins >= 60 ? t('hours', { h: Math.floor(mins / 60), m: mins % 60 }) : `${mins}:${String(secs).padStart(2, '0')}` });
  return (
    <View style={[styles.countdown, { backgroundColor: bg }]} accessibilityRole="timer" accessibilityLabel={label}>
      <Timer size={14} color={fg} strokeWidth={2.4} />
      <Text variant="caption" weight="bold" color={fg} tabular numberOfLines={1} style={styles.shrink}>
        {label}
      </Text>
    </View>
  );
}

/** One visit in a schedule list (memoised for FlatList): a calendar-leaf date, then who/where/when. */
export const VisitRow = memo(function VisitRowView({ visit, onPress }: { visit: CaregiverVisitListItem; onPress: (id: string) => void }) {
  const now = useNow(60_000);
  const t = useT('caregiverA.visitRow');
  const f = useFmt();
  const L = useLabels();
  const active = ACTIVE_STATUSES.includes(visit.status);
  const overdue = visit.status === 'CONFIRMED' && visitStart(visit.scheduledDate, visit.timeWindowEnd) < now;
  const day = Number(dayKey(visit.scheduledDate).slice(8, 10));
  return (
    <Touchable
      onPress={() => onPress(visit.id)}
      accessibilityRole="button"
      accessibilityLabel={`${visit.booking.patient.name}, ${f.relativeDay(visit.scheduledDate)} ${f.timeWindow(visit.timeWindowStart, visit.timeWindowEnd)}`}
      style={[styles.row, active && styles.rowActive]}>
      <DateBlock day={day} label={dateBlockLabel(f, visit.scheduledDate)} highlight={active} />
      <View style={styles.rowBody}>
        <Text weight="bold" numberOfLines={1}>
          {visit.booking.patient.name}
        </Text>
        <View style={styles.inline}>
          <Clock size={13} color={brand[600]} />
          <Text variant="small" weight="semibold" color={brand[800]} numberOfLines={1} style={[styles.shrink, styles.ltr]}>
            {f.timeWindow(visit.timeWindowStart, visit.timeWindowEnd)}
          </Text>
        </View>
        <View style={styles.inline}>
          <MapPin size={13} color={ink[400]} />
          <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.flex}>
            {`${visit.booking.address.addressLine}, ${visit.booking.address.city}`}
          </Text>
        </View>
        <View style={styles.rowMeta}>
          <Badge tone={overdue ? 'warning' : VISIT_TONE[visit.status]} label={overdue ? t('notStarted') : L.visitCaregiver(visit.status)} />
          <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
            {L.specialty(visit.booking.serviceType)}
          </Text>
          {visit.booking.type === 'RECURRING' && <Repeat size={13} color={ink[400]} accessibilityLabel={t('recurring')} />}
        </View>
      </View>
      <DirChevron />
    </Touchable>
  );
});

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  ltr: { writingDirection: 'ltr' },
  panel: { gap: space.md },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  detail: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg, paddingVertical: 4 },
  detailLabel: { flexShrink: 0, maxWidth: '45%' },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    minHeight: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ink[100],
    ...shadow.card,
  },
  rowActive: { borderColor: brand[300], backgroundColor: brand[50] },
  rowBody: { flex: 1, gap: 3 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
}));
