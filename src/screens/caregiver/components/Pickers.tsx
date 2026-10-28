import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Field } from '../../../components/form';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from '../../../components/icons';
import { Sheet } from '../../../components/overlay';
import { Text } from '../../../components/Text';
import { Button, IconButton, Touchable } from '../../../components/ui';
import { useSettings, useT } from '../../../i18n';
import { fromDateOnly, useFmt } from '../../../i18n/format';
import { brand, colors, ink, radius, space, TOUCH, themed, feedback } from '../../../theme';
import { toDayKey } from './helpers';

/*
 * Lightweight time and date pickers in a bottom sheet. Kept dependency-free on
 * purpose (no native date picker module); large tap targets for elderly-care
 * workers using the app one-handed.
 */

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06 … 23
const MINUTES = [0, 15, 30, 45];
const pad = (n: number) => String(n).padStart(2, '0');

/** `compact` drops the leading icon so two time fields + a remove button fit a 360dp row. */
function PickerButton({ icon: Icon, value, placeholder, onPress, label, error, compact, numeric }: { icon: typeof Clock; value: string | null; placeholder: string; onPress: () => void; label: string; error?: boolean; compact?: boolean; numeric?: boolean }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? placeholder}`} style={[styles.button, compact && styles.buttonCompact, error && styles.buttonError]}>
      {!compact && <Icon size={18} color={ink[500]} />}
      <Text weight="semibold" color={value ? colors.text : ink[400]} numberOfLines={1} numeric={numeric && !!value} align={compact ? 'center' : undefined} style={styles.flex}>
        {value ?? placeholder}
      </Text>
    </Touchable>
  );
}

/** HH:mm picker: hour grid + quarter-hour row. */
export function TimeField({ label, value, onChange, error, compact }: { label: string; value: string; onChange: (v: string) => void; error?: boolean; compact?: boolean }) {
  const t = useT('mobileCaregiver.pickers');
  const fmt = useFmt();
  const [open, setOpen] = useState(false);
  const [h, m] = value ? value.split(':').map(Number) : [9, 0];
  const [hour, setHour] = useState(h);
  const [minute, setMinute] = useState(m);

  const button = (
    <PickerButton
      icon={Clock}
      label={label}
      value={value ? fmt.time(value) : null}
      placeholder={t('chooseTime')}
      error={error}
      compact={compact}
      numeric
      onPress={() => {
        setHour(h);
        setMinute(m);
        setOpen(true);
      }}
    />
  );
  return (
    <>
      {compact ? button : <Field label={label}>{button}</Field>}
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          <Button
            label={t('setTime', { time: fmt.time(`${pad(hour)}:${pad(minute)}`) })}
            block
            size="lg"
            onPress={() => {
              onChange(`${pad(hour)}:${pad(minute)}`);
              setOpen(false);
            }}
          />
        }>
        <Text variant="small" weight="semibold" color={ink[600]}>
          {t('hour')}
        </Text>
        <View style={styles.grid}>
          {HOURS.map(x => (
            <Cell key={x} label={fmt.time(`${pad(x)}:00`).replace(':00', '')} on={x === hour} onPress={() => setHour(x)} />
          ))}
        </View>
        <Text variant="small" weight="semibold" color={ink[600]}>
          {t('minute')}
        </Text>
        <View style={styles.grid}>
          {MINUTES.map(x => (
            <Cell key={x} label={`:${pad(x)}`} on={x === minute} onPress={() => setMinute(x)} wide />
          ))}
        </View>
      </Sheet>
    </>
  );
}

function Cell({ label, on, onPress, wide, disabled, muted, day }: { label: string; on: boolean; onPress: () => void; wide?: boolean; disabled?: boolean; muted?: boolean; day?: boolean }) {
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      style={[styles.cell, wide && styles.cellWide, day && styles.cellDay, on && styles.cellOn, disabled && styles.cellDisabled]}>
      <Text variant="small" weight={on ? 'bold' : 'semibold'} color={on ? '#fff' : muted ? ink[400] : ink[800]} align="center" numeric numberOfLines={1}>
        {label}
      </Text>
    </Touchable>
  );
}

/** YYYY-MM-DD picker with a month grid. `min` disables earlier days. */
export function DateField({ label, value, onChange, min, error, hint }: { label: string; value: string; onChange: (v: string) => void; min?: string; error?: string | null; hint?: string }) {
  const t = useT('mobileCaregiver.pickers');
  const fmt = useFmt();
  const { isRTL } = useSettings();
  const [open, setOpen] = useState(false);
  const initial = value ? fromDateOnly(value) : min ? fromDateOnly(min) : new Date();
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    // Monday-first grid.
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  }, [month]);

  const Prev = isRTL ? ChevronRight : ChevronLeft;
  const Next = isRTL ? ChevronLeft : ChevronRight;
  return (
    <Field label={label} error={error} hint={hint}>
      <PickerButton icon={CalendarDays} label={label} value={value ? fmt.longDay(value) : null} placeholder={t('chooseDate')} error={!!error} onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View style={styles.monthHead}>
          <IconButton icon={Prev} label={t('prevMonth')} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
          <Text weight="bold" align="center" numberOfLines={1} style={styles.flex}>
            {fmt.monthYear(month)}
          </Text>
          <IconButton icon={Next} label={t('nextMonth')} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
        </View>
        <View style={styles.week}>
          {[1, 2, 3, 4, 5, 6, 0].map(d => (
            // Urdu weekday names are full words: shrink harder than the default so they fit 1/7 width.
            <Text key={d} variant="caption" color={ink[500]} align="center" style={styles.weekDay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {fmt.dayOfWeek(d)}
            </Text>
          ))}
        </View>
        <View style={styles.week}>
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={styles.day} />;
            const key = toDayKey(d);
            const disabled = !!min && key < min;
            return (
              <View key={key} style={styles.day}>
                <Cell
                  label={String(d.getDate())}
                  on={key === value}
                  disabled={disabled}
                  muted={disabled}
                  day
                  onPress={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                />
              </View>
            );
          })}
        </View>
      </Sheet>
    </Field>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TOUCH + 4,
    borderWidth: 1.5,
    borderColor: ink[200],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    overflow: 'hidden',
  },
  buttonCompact: { paddingHorizontal: space.sm, justifyContent: 'center' },
  buttonError: { borderColor: feedback.danger500 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { minWidth: 64, height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: ink[200], alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm, overflow: 'hidden' },
  cellWide: { minWidth: 72 },
  cellDay: { minWidth: 0, paddingHorizontal: 0, borderColor: 'transparent' },
  cellOn: { backgroundColor: brand[700], borderColor: brand[700] },
  cellDisabled: { opacity: 0.4 },
  monthHead: { flexDirection: 'row', alignItems: 'center' },
  week: { flexDirection: 'row', flexWrap: 'wrap' },
  weekDay: { width: `${100 / 7}%`, paddingVertical: 4, paddingHorizontal: 1 },
  day: { width: `${100 / 7}%`, padding: 2, alignItems: 'stretch' },
}));
