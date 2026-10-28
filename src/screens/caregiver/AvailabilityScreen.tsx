import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { availabilityApi } from '../../api/caregiver/api';
import { keys } from '../../api/caregiver/keys';
import type { Availability, AvailabilityRuleInput } from '../../api/types';
import { TextField } from '../../components/form';
import { Plus, Trash, X } from '../../components/icons';
import { ConfirmSheet } from '../../components/overlay';
import { ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Button, IconButton, Touchable } from '../../components/ui';
import { useT } from '../../i18n';
import { localDayKey, useFmt } from '../../i18n/format';
import { useAction, useQuery } from '../../lib/query';
import { brand, colors, feedback, ink, radius, space, themed } from '../../theme';
import { Panel } from './components/Bits';
import { CalendarOff, Copy } from './components/icons';
import { DateField, TimeField } from './components/Pickers';

/** Display Monday-first; the API uses 0 = Sunday … 6 = Saturday. */
const DAYS = [1, 2, 3, 4, 5, 6, 0];

type Win = { start: string; end: string };
type Week = Record<number, Win[]>;
type DayError = 'bothTimes' | 'endAfterStart' | 'overlap';

function toWeek(a: Availability): Week {
  const week: Week = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const r of a.rules) week[r.dayOfWeek].push({ start: r.startTime, end: r.endTime });
  return week;
}

/** The API doesn't validate rule items, so check start < end and no overlaps here. */
function dayError(wins: Win[]): DayError | null {
  const sorted = [...wins].sort((a, b) => a.start.localeCompare(b.start));
  for (const w of sorted) {
    if (!/^\d{2}:\d{2}$/.test(w.start) || !/^\d{2}:\d{2}$/.test(w.end)) return 'bothTimes';
    if (w.start >= w.end) return 'endAfterStart';
  }
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) return 'overlap';
  return null;
}

/** FR-CG4: weekly availability + blocked dates. */
export function AvailabilityScreen() {
  const t = useT('caregiverB.availability');
  const f = useFmt();
  const availability = useQuery(keys.availability, availabilityApi.get);
  const a = availability.data;

  const summary = a && a.rules.length > 0
    ? t('summary', {
        days: f.list(DAYS.filter(d => a.rules.some(r => r.dayOfWeek === d)).map(f.dayOfWeek)),
        time: f.time([...a.rules].sort((x, y) => x.startTime.localeCompare(y.startTime))[0].startTime),
      })
    : t('emptySummary');

  if (availability.error) {
    return (
      <Screen title={t('title')} back>
        <ErrorState error={availability.error} onRetry={availability.refetch} />
      </Screen>
    );
  }
  if (!a) {
    return (
      <Screen title={t('title')} back>
        <SkeletonList count={3} height={140} />
      </Screen>
    );
  }
  // Remount the editor when saved rules change so it starts from the server copy.
  return <Editor key={a.rules.map(r => `${r.id}${r.startTime}${r.endTime}`).join()} availability={a} summary={summary} />;
}

function Editor({ availability, summary }: { availability: Availability; summary: string }) {
  const t = useT('caregiverB.availability');
  const tw = useT('caregiverB.availability.weekly');
  const tm = useT('mobileCaregiver.availability');
  const f = useFmt();
  const [week, setWeek] = useState<Week>(() => toWeek(availability));
  const [dirty, setDirty] = useState(false);

  const update = (dow: number, wins: Win[]) => {
    setWeek(w => ({ ...w, [dow]: wins }));
    setDirty(true);
  };
  const errors = Object.fromEntries(DAYS.map(d => [d, dayError(week[d])])) as Record<number, DayError | null>;
  const valid = Object.values(errors).every(e => !e);

  const save = useAction(
    () => {
      const rules: AvailabilityRuleInput[] = DAYS.flatMap(d => week[d].map(w => ({ dayOfWeek: d, startTime: w.start, endTime: w.end })));
      return availabilityApi.put(rules);
    },
    { invalidate: [keys.availability], success: tw('saved'), onSuccess: () => setDirty(false) },
  );

  const copyMonday = () => {
    setWeek(w => ({ ...w, 2: [...w[1]], 3: [...w[1]], 4: [...w[1]], 5: [...w[1]] }));
    setDirty(true);
  };

  return (
    <Screen
      title={t('title')}
      subtitle={summary}
      back
      footer={
        <View style={styles.footerRow}>
          <Text variant="small" color={dirty ? feedback.warning700 : colors.textMuted} numberOfLines={2} style={styles.flex}>
            {dirty ? tw('unsaved') : tw('allSaved')}
          </Text>
          <Button label={tw('save')} disabled={!dirty || !valid} loading={save.isPending} onPress={() => save.run(undefined)} />
        </View>
      }>
      <Panel
        title={tw('title')}
        description={tw('description')}>
        {week[1].length > 0 && (
          <Touchable onPress={copyMonday} accessibilityRole="button" style={styles.copyRow}>
            <Copy size={16} color={brand[700]} />
            <Text variant="small" weight="bold" color={brand[700]} style={styles.shrink}>
              {tw('copyMonday')}
            </Text>
          </Touchable>
        )}
        {DAYS.map((dow, di) => {
          const name = f.dayOfWeekLong(dow);
          const wins = week[dow];
          const on = wins.length > 0;
          return (
            <View key={dow} style={[styles.day, di > 0 && styles.dayBorder]}>
              <View style={styles.dayHead}>
                <Text weight="bold" numberOfLines={1} style={styles.flex}>
                  {name}
                </Text>
                {!on && (
                  <Text variant="small" color={colors.textMuted} numberOfLines={1}>
                    {tw('unavailable')}
                  </Text>
                )}
                <Switch
                  value={on}
                  onValueChange={v => update(dow, v ? [{ start: '09:00', end: '17:00' }] : [])}
                  trackColor={{ true: brand[500], false: ink[300] }}
                  thumbColor="#fff"
                  accessibilityLabel={tw('dayAvailable', { day: name })}
                />
              </View>
              {wins.map((w, i) => (
                <View key={i} style={styles.window}>
                  <View style={styles.flex}>
                    <TimeField compact label={tw('windowStart', { day: name, n: i + 1 })} value={w.start} onChange={v => update(dow, wins.map((x, j) => (j === i ? { ...x, start: v } : x)))} />
                  </View>
                  <Text variant="small" color={colors.textMuted} numberOfLines={1}>
                    {tm('until')}
                  </Text>
                  <View style={styles.flex}>
                    <TimeField compact label={tw('windowEnd', { day: name, n: i + 1 })} value={w.end} onChange={v => update(dow, wins.map((x, j) => (j === i ? { ...x, end: v } : x)))} />
                  </View>
                  <IconButton icon={X} label={tw('removeWindow')} onPress={() => update(dow, wins.filter((_, j) => j !== i))} />
                </View>
              ))}
              {!!errors[dow] && (
                <Text variant="small" color={feedback.danger700}>
                  {tw(`errors.${errors[dow]}`)}
                </Text>
              )}
              {on && (
                <Touchable
                  onPress={() => {
                    const last = wins[wins.length - 1];
                    update(dow, [...wins, { start: last?.end ?? '09:00', end: last ? '20:00' : '17:00' }]);
                  }}
                  accessibilityRole="button"
                  style={styles.addWindow}>
                  <Plus size={16} color={brand[700]} />
                  <Text variant="small" weight="bold" color={brand[700]} numberOfLines={1} style={styles.shrink}>
                    {tw('addWindow')}
                  </Text>
                </Touchable>
              )}
            </View>
          );
        })}
      </Panel>

      <TimeOff blocks={availability.blocks} />
    </Screen>
  );
}

function TimeOff({ blocks }: { blocks: Availability['blocks'] }) {
  const t = useT('caregiverB.availability.timeOff');
  const f = useFmt();
  const today = localDayKey(Date.now());
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const error = start && end && end < start ? t('endBeforeStart') : null;

  const add = useAction(() => availabilityApi.addBlock({ startDate: start, endDate: end || start, reason: reason.trim() || undefined }), {
    invalidate: [keys.availability],
    success: t('blocked'),
    onSuccess: () => {
      setStart('');
      setEnd('');
      setReason('');
    },
  });
  const remove = useAction((id: string) => availabilityApi.deleteBlock(id), { invalidate: [keys.availability], success: t('removed') });
  const [removing, setRemoving] = useState<string | null>(null);
  const tc = useT('common.actions');

  return (
    <Panel title={t('title')} description={t('description')}>
      <DateField label={t('from')} value={start} onChange={setStart} min={today} />
      <DateField label={t('to')} value={end} onChange={setEnd} min={start || today} error={error} />
      <TextField label={t('reason')} hint={t('reasonHint')} placeholder={t('reasonPlaceholder')} value={reason} onChangeText={setReason} maxLength={200} />
      <Button label={t('block')} icon={CalendarOff} variant="secondary" disabled={!start || !!error} loading={add.isPending} onPress={() => add.run(undefined)} block />
      {blocks.map(b => (
        <View key={b.id} style={styles.block}>
          <CalendarOff size={18} color={ink[400]} />
          <View style={styles.flex}>
            <Text variant="small" weight="semibold">
              {b.endDate.slice(0, 10) !== b.startDate.slice(0, 10) ? `${f.longDay(b.startDate)} – ${f.longDay(b.endDate)}` : f.longDay(b.startDate)}
            </Text>
            {!!b.reason && (
              <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
                {b.reason}
              </Text>
            )}
          </View>
          <IconButton icon={Trash} label={t('removeBlock')} color={feedback.danger600} onPress={() => setRemoving(b.id)} />
        </View>
      ))}
      <ConfirmSheet
        visible={!!removing}
        title={t('removeBlock')}
        confirmLabel={tc('remove')}
        danger
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.run(removing).then(() => setRemoving(null))}
      />
    </Panel>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%', minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.sm, overflow: 'hidden' },
  day: { gap: space.sm, paddingVertical: space.md },
  dayBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink[200] },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  window: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  addWindow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.sm, overflow: 'hidden' },
  block: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: ink[25], borderWidth: 1, borderColor: ink[100] },
}));
