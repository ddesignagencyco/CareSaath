import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Select, type Option } from '../../../components/form';
import { Calendar, ChevronDown, X } from '../../../components/icons';
import { Sheet } from '../../../components/overlay';
import { Text } from '../../../components/Text';
import { Touchable } from '../../../components/ui';
import { useT } from '../../../i18n';
import { fromDateOnly, localDayKey, useFmt } from '../../../i18n/format';
import { brand, colors, feedback, ink, radius, space, themed, brandFixed } from '../../../theme';

const DAY = 86_400_000;

/** "YYYY-MM-DD" + n days, in local time. */
export function addDays(key: string, n: number): string {
  const d = fromDateOnly(key);
  d.setDate(d.getDate() + n);
  return localDayKey(d.getTime());
}

/* ---- Horizontal date strip ------------------------------------------------ */

const CHIP_W = 64;

/**
 * Tap-to-pick days for the next `count` days from `from`. A strip beats a
 * month grid on a phone: the next fortnight is what people book, and every
 * target is a full 64×72 thumb-sized chip.
 */
export function DateStrip({ value, onChange, from, count = 60, label }: { value: string; onChange: (d: string) => void; from: string; count?: number; label: string }) {
  const days = useMemo(() => Array.from({ length: count }, (_, i) => addDays(from, i)), [from, count]);
  const initial = Math.max(0, days.indexOf(value));
  const render = useCallback(({ item }: { item: string }) => <DayChip day={item} selected={item === value} onPress={onChange} />, [value, onChange]);
  return (
    <View style={styles.stripWrap}>
      <Text weight="bold" color={colors.text} accessibilityRole="header">
        {label}
      </Text>
      {/* Pinned LTR: offset-based scrolling (initialScrollIndex) assumes LTR, and
          a chronological date row reads left-to-right in Urdu apps too. */}
      <FlatList
        horizontal
        style={styles.ltrStrip}
        data={days}
        keyExtractor={d => d}
        renderItem={render}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        getItemLayout={(_, index) => ({ length: CHIP_W + space.sm, offset: (CHIP_W + space.sm) * index, index })}
        initialScrollIndex={initial > 2 ? initial - 1 : 0}
        extraData={value}
      />
    </View>
  );
}

const DayChip = memo(function DayChipView({ day, selected, onPress }: { day: string; selected: boolean; onPress: (d: string) => void }) {
  const f = useFmt();
  const d = fromDateOnly(day);
  const parts = f.shortDay(day).split(/[,،]\s*/);
  const weekday = parts[0];
  const month = (parts[1] ?? '').replace(/^\d+\s*/, '');
  return (
    <Touchable
      onPress={() => onPress(day)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={f.longDay(day)}
      style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}>
      <Text variant="caption" weight="semibold" color={selected ? brandFixed[100] : ink[500]} align="center" numberOfLines={1}>
        {weekday}
      </Text>
      <Text variant="title" weight="extrabold" color={selected ? '#fff' : colors.text} align="center" tabular style={styles.ltr}>
        {String(d.getDate())}
      </Text>
      <Text variant="caption" color={selected ? brandFixed[100] : ink[400]} align="center" numberOfLines={1}>
        {month}
      </Text>
    </Touchable>
  );
});

/* ---- Time window ---------------------------------------------------------- */

/** Half-hour slots from 06:00 to 22:00. */
const SLOTS = Array.from({ length: 33 }, (_, i) => {
  const m = 6 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});

const hhmm = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** The current time rounded up to the next half hour ("14:52" -> "15:00"): the earliest start for today. */
export function nextSlot(now = new Date()): string {
  return hhmm(Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30);
}

/** A window starting at `from` that lasts an hour (capped at the last slot). */
export function windowFrom(from: string): { from: string; to: string } {
  const end = Math.min(toMinutes(from) + 60, toMinutes(SLOTS[SLOTS.length - 1]));
  return { from, to: hhmm(end) };
}

/**
 * Arrival window. `minFrom` (today's bookings) hides start times that have
 * already passed; the end list only offers times after the chosen start.
 */
export function TimeWindowPicker({
  from,
  to,
  onFrom,
  onTo,
  fromLabel,
  toLabel,
  minFrom,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  fromLabel: string;
  toLabel: string;
  minFrom?: string;
}) {
  const f = useFmt();
  // Keep a non-slot value (e.g. a reschedule loaded from the API) selectable.
  const all = useMemo(() => [...new Set([...SLOTS, from, to])].sort(), [from, to]);
  const options = useMemo(
    () => all.filter(s => s < SLOTS[SLOTS.length - 1] && (!minFrom || s >= minFrom)).map<Option<string>>(s => ({ value: s, label: f.time(s) })),
    [all, minFrom, f],
  );
  const endOptions = useMemo(() => all.filter(s => s > from).map<Option<string>>(s => ({ value: s, label: f.time(s) })), [all, from, f]);
  return (
    <View style={styles.timeBlock}>
      <Text weight="bold" color={colors.text} accessibilityRole="header">
        {fromLabel}
      </Text>
      <View style={styles.timeRow}>
        <View style={styles.flex}>
        <Select label="" placeholder={fromLabel} value={from} options={options} columns={3} searchable={false} onChange={v => {
          onFrom(v);
          // Keep the window at least an hour by moving the end along.
          if (v >= to) onTo(SLOTS.find(s => s > v && toMinutes(s) - toMinutes(v) >= 60) ?? to);
        }} />
        </View>
        <Text weight="semibold" color={colors.textMuted} style={styles.timeAnd}>
          {toLabel}
        </Text>
        <View style={styles.flex}>
          <Select label="" placeholder={toLabel} value={to} options={endOptions} columns={3} searchable={false} onChange={onTo} />
        </View>
      </View>
    </View>
  );
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/* ---- Date of birth -------------------------------------------------------- */

type DobStep = 'year' | 'month' | 'day';

/**
 * One field that opens a guided picker: year, then month, then day. Patients
 * are mostly elderly, so the year comes first (a 1950 birth is a short scroll,
 * not 900 taps back through a calendar), the year list opens around 1960, and
 * the picked parts stay tappable at the top to change one step. The field
 * then reads "12 March 1950 · 76 yrs".
 */
export function DobPicker({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | null }) {
  const t = useT('customerB.patientForm');
  const tm = useT('mobileCustomer.dob');
  const tc = useT('common.states');
  const f = useFmt();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DobStep>('year');
  const [draft, setDraft] = useState({ y: '', m: '', d: '' });
  const scroll = useRef<ScrollViewInstance>(null);

  const complete = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const today = new Date();
  const thisYear = today.getFullYear();
  const monthName = (m: string) => f.monthYear(new Date(2000, Number(m) - 1, 1)).replace(/\s*2000$/, '');
  const shown = complete ? `${f.longDay(value).split(/[,،]\s*/).pop()} ${value.slice(0, 4)} · ${f.age(value)}` : null;

  const start = () => {
    const [y = '', m = '', d = ''] = complete ? value.split('-') : [];
    setDraft({ y, m, d });
    setStep('year');
    setOpen(true);
  };
  const pickYear = (y: string) => {
    setDraft(p => ({ ...p, y }));
    setStep('month');
  };
  const pickMonth = (m: string) => {
    setDraft(p => ({ ...p, m }));
    setStep('day');
  };
  const pickDay = (d: string) => {
    onChange(`${draft.y}-${draft.m}-${d}`);
    setOpen(false);
  };

  const years = Array.from({ length: 110 }, (_, i) => String(thisYear - i));
  const maxMonth = draft.y === String(thisYear) ? today.getMonth() + 1 : 12;
  const months = Array.from({ length: maxMonth }, (_, i) => String(i + 1).padStart(2, '0'));
  const daysIn = draft.y && draft.m ? new Date(Number(draft.y), Number(draft.m), 0).getDate() : 31;
  const isThisMonth = draft.y === String(thisYear) && Number(draft.m) === today.getMonth() + 1;
  const days = Array.from({ length: isThisMonth ? today.getDate() : daysIn }, (_, i) => String(i + 1).padStart(2, '0'));
  // Calendar alignment: blanks before the 1st, so days sit under their weekday.
  const lead = draft.y && draft.m ? new Date(Number(draft.y), Number(draft.m) - 1, 1).getDay() : 0;
  const weekdays = Array.from({ length: 7 }, (_, i) => f.dayOfWeek(i));
  // Without a saved year, open the list around 1960 (typical patient age).
  const anchorYear = draft.y || '1960';

  const crumb = (label: string, target: DobStep, on: boolean) => (
    <Touchable key={target} onPress={() => setStep(target)} accessibilityRole="button" style={[styles.crumb, on && styles.crumbOn]}>
      <Text variant="small" weight="bold" color={on ? colors.onPrimary : brand[800]} numberOfLines={1}>
        {label}
      </Text>
    </Touchable>
  );

  return (
    <View style={styles.gap}>
      <Text variant="small" weight="semibold" color={ink[700]}>
        {t('dob')}
        <Text variant="small" color={ink[500]}>{`  ${tc('optional')}`}</Text>
      </Text>
      <Touchable onPress={start} accessibilityRole="button" accessibilityLabel={`${t('dob')}: ${shown ?? tm('placeholder')}`} style={[styles.dobField, !!error && styles.dobError]}>
        <Calendar size={20} color={shown ? brand[700] : ink[400]} />
        <Text weight={shown ? 'semibold' : 'regular'} color={shown ? colors.text : ink[400]} style={styles.flex} numberOfLines={1}>
          {shown ?? tm('placeholder')}
        </Text>
        {complete ? (
          <Touchable onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel={tm('clear')} hitSlop={8} style={styles.clear}>
            <X size={18} color={ink[500]} />
          </Touchable>
        ) : (
          <ChevronDown size={20} color={ink[500]} />
        )}
      </Touchable>
      {!!error && (
        <Text variant="small" color={feedback.danger700}>
          {error}
        </Text>
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title={step === 'year' ? tm('chooseYear') : step === 'month' ? tm('chooseMonth') : tm('chooseDay')} scrollRef={scroll}>
        {/* What's picked so far; tap a part to change it. */}
        <View style={styles.crumbs}>
          {crumb(draft.y || tm('year'), 'year', step === 'year')}
          {!!draft.y && crumb(draft.m ? monthName(draft.m) : tm('month'), 'month', step === 'month')}
          {!!draft.m && crumb(draft.d ? String(Number(draft.d)) : tm('day'), 'day', step === 'day')}
        </View>

        {step === 'year' && (
          <View style={styles.pickGrid}>
            {years.map(y => {
              const on = y === draft.y;
              return (
                <Touchable
                  key={`${y}-${on}`}
                  onPress={() => pickYear(y)}
                  onLayout={y === anchorYear ? e => scroll.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 96), animated: false }) : undefined}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[styles.pickCell, styles.cell4, on ? styles.pickOn : styles.pickOff]}>
                  <Text weight={on ? 'bold' : 'semibold'} numeric color={on ? colors.onPrimary : colors.text} align="center">
                    {y}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        )}

        {step === 'month' && (
          <View style={styles.pickGrid}>
            {months.map(m => {
              const on = m === draft.m;
              return (
                <Touchable key={`${m}-${on}`} onPress={() => pickMonth(m)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.pickCell, styles.cell3, on ? styles.pickOn : styles.pickOff]}>
                  <Text weight={on ? 'bold' : 'semibold'} color={on ? colors.onPrimary : colors.text} align="center" numberOfLines={1}>
                    {monthName(m)}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        )}

        {step === 'day' && (
          <View style={styles.calendar}>
            <View style={styles.weekRow}>
              {weekdays.map(w => (
                <Text key={w} variant="caption" weight="bold" color={colors.textMuted} align="center" style={styles.cell7} numberOfLines={1}>
                  {w}
                </Text>
              ))}
            </View>
            <View style={styles.weekRow}>
              {Array.from({ length: lead }, (_, i) => (
                <View key={`b${i}`} style={styles.cell7} />
              ))}
              {days.map(d => {
                const on = d === draft.d;
                return (
                  <View key={d} style={styles.cell7}>
                    <Touchable key={`${d}-${on}`} onPress={() => pickDay(d)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${Number(d)} ${monthName(draft.m)} ${draft.y}`} style={[styles.dayCell, on ? styles.pickOn : styles.pickOff]}>
                      <Text weight={on ? 'bold' : 'semibold'} numeric color={on ? colors.onPrimary : colors.text} align="center">
                        {String(Number(d))}
                      </Text>
                    </Touchable>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </Sheet>
    </View>
  );
}

/** True when a partially picked DOB is incomplete. */
export const dobIncomplete = (v: string) => !!v && !/^\d{4}-\d{2}-\d{2}$/.test(v);

export { DAY };

const styles = themed(() => StyleSheet.create({
  ltrStrip: { direction: 'ltr' },
  flex: { flex: 1 },
  gap: { gap: 6 },
  ltr: { writingDirection: 'ltr' },
  stripWrap: { gap: 6 },
  strip: { gap: space.sm, paddingVertical: 2 },
  chip: { width: CHIP_W, minHeight: 76, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingVertical: space.sm, overflow: 'hidden' },
  chipOn: { backgroundColor: brand[700], borderColor: brand[700] },
  chipOff: { backgroundColor: colors.surface, borderColor: ink[200] },
  timeBlock: { gap: space.sm },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  timeAnd: { paddingHorizontal: 2 },
  dobField: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, borderWidth: 1.5, borderColor: ink[200], borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: space.md },
  dobError: { borderColor: feedback.danger500 },
  clear: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  crumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  crumb: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: brand[50], borderWidth: 1, borderColor: brand[200] },
  crumbOn: { backgroundColor: brand[700], borderColor: brand[700] },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pickCell: { minHeight: 48, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xs },
  cell4: { width: '23%' },
  cell3: { width: '31.5%' },
  pickOn: { backgroundColor: brand[700], borderColor: brand[700] },
  pickOff: { backgroundColor: colors.surface, borderColor: ink[200] },
  // Calendar stays LTR (Sun → Sat left to right) like a printed calendar in Urdu too.
  calendar: { gap: space.xs, direction: 'ltr' },
  weekRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.xs },
  cell7: { width: `${100 / 7}%`, alignItems: 'center' },
  dayCell: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
}));
