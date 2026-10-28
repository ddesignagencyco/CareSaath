import React, { forwardRef, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type ScrollViewInstance, type TextInputInstance, type TextInputProps } from 'react-native';
import { brand, colors, feedback, fonts, ink, radius, space, TOUCH, themed } from '../theme';
import { useSettings, useT } from '../i18n';
import { isPhoneComplete, parsePkMobile, sanitizePhoneInput } from '../lib/phone';
import { Check, ChevronDown, CircleCheck } from './icons';
import { Sheet } from './overlay';
import { Text, useTextStyle } from './Text';
import { Touchable } from './ui';

/* ---- Field wrapper ------------------------------------------------------- */

export function Field({ label, hint, error, optional, children }: { label?: string; hint?: string; error?: string | null; optional?: boolean; children: React.ReactNode }) {
  const tc = useT('common.states');
  return (
    <View style={styles.field}>
      {!!label && (
        <Text variant="small" weight="semibold" color={ink[700]}>
          {label}
          {optional ? <Text variant="small" color={ink[400]}>{`  ${tc('optional')}`}</Text> : null}
        </Text>
      )}
      {children}
      {error ? (
        <Text variant="small" color={feedback.danger700} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color={colors.textMuted}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ---- Text input ---------------------------------------------------------- */

export interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  prefix?: string;
  /** Trailing adornment inside the box (e.g. a "valid" tick). */
  suffix?: React.ReactNode;
  /** Force LTR for numbers, codes, CNIC — even in Urdu. */
  ltr?: boolean;
}

export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, hint, error, optional, prefix, suffix, ltr, multiline, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const { isRTL } = useSettings();
  const text = useTextStyle('body');
  const rtl = isRTL && !ltr;
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      <View
        style={[
          styles.inputWrap,
          multiline && styles.multilineWrap,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          ltr && { flexDirection: 'row' },
          ltr && isRTL && { direction: 'ltr' },
        ]}>
        {!!prefix && (
          <Text weight="semibold" color={ink[500]} style={styles.prefix}>
            {prefix}
          </Text>
        )}
        <TextInput
          ref={ref}
          placeholderTextColor={ink[400]}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          accessibilityLabel={label}
          onFocus={e => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            ltr ? { fontFamily: fonts.medium, fontSize: text.fontSize } : { fontFamily: text.fontFamily, fontSize: text.fontSize },
            { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' },
            multiline && styles.multiline,
            style,
          ]}
          {...rest}
        />
        {suffix}
      </View>
    </Field>
  );
});

/**
 * Pakistani mobile number, validated as you type (parsePkMobile): extra
 * digits past the full length are ignored, a problem shows as soon as the
 * number is complete or the field loses focus (not on every keystroke while
 * it's still half typed), and a green tick confirms a valid number.
 * A caller's `error` (e.g. from the server) wins over the live check.
 */
export function PhoneField({ error, onBlur, ...props }: Omit<TextFieldProps, 'onChangeText' | 'value'> & { value: string; onChangeText: (v: string) => void }) {
  const t = useT('shared.phone');
  const [blurred, setBlurred] = useState(false);
  const result = parsePkMobile(props.value);
  const show = !!props.value.trim() && (blurred || isPhoneComplete(props.value));
  const live = show && !result.ok ? t(result.code) : null;
  return (
    <TextField
      label={t('label')}
      placeholder="0300 1234567"
      keyboardType="phone-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      ltr
      maxLength={17}
      {...props}
      error={error || live}
      suffix={result.ok && !error ? <CircleCheck size={20} color={feedback.success600} accessibilityLabel={t('valid')} /> : undefined}
      onBlur={e => {
        setBlurred(true);
        onBlur?.(e);
      }}
      onChangeText={v => props.onChangeText(sanitizePhoneInput(v))}
    />
  );
}

/* ---- OTP input ----------------------------------------------------------- */

/**
 * Six boxes backed by one hidden input, so paste and SMS autofill
 * (one-time-code) work and the keyboard never jumps between fields.
 */
export function OtpInput({ value, onChange, length = 6, error, autoFocus = true }: { value: string; onChange: (v: string) => void; length?: number; error?: boolean; autoFocus?: boolean }) {
  const input = useRef<TextInputInstance>(null);
  const t = useT('shared.otp');
  const [focused, setFocused] = useState(autoFocus);
  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel={t('group')} style={styles.otpRow}>
      {Array.from({ length }, (_, i) => {
        const ch = value[i] ?? '';
        const active = focused && i === Math.min(value.length, length - 1);
        return (
          <View key={i} style={[styles.otpBox, ch ? styles.otpFilled : null, active && styles.otpActive, error && styles.inputError]}>
            <Text variant="h2" weight="bold" align="center" style={{ writingDirection: 'ltr' }}>
              {ch}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={v => onChange(v.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hiddenInput}
        caretHidden
      />
    </Pressable>
  );
}

/* ---- Select -------------------------------------------------------------- */

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/** Lists longer than this get a search box in the sheet. */
const SEARCH_FROM = 10;

/**
 * Pick one of a set.
 * - `variant="chips"`: short sets (gender, licence body) as tap targets in the
 *   form itself; one tap, no sheet.
 * - default: a field that opens a sheet of radio rows. The sheet opens
 *   scrolled to the current choice, long lists get a search box, and
 *   `columns` lays short labels (times, days) out as a grid.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  error,
  hint,
  optional,
  variant = 'sheet',
  columns,
  searchable,
}: {
  label: string;
  value: T | null | undefined;
  options: Option<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  optional?: boolean;
  variant?: 'sheet' | 'chips';
  columns?: number;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const tc = useT('common.states');
  const tm = useT('mobile.common');
  const scroll = useRef<ScrollViewInstance>(null);
  const current = options.find(o => o.value === value);

  if (variant === 'chips') {
    return (
      <Field label={label} error={error} hint={hint} optional={optional}>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
          {options.map(o => {
            const on = o.value === value;
            return (
              <Touchable
                // Remount on toggle: Android drops rounded corners when backgroundColor changes in place.
                key={`${o.value}-${on ? 'on' : 'off'}`}
                onPress={() => onChange(o.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={o.label}
                style={[styles.choice, on ? styles.choiceOn : styles.choiceOff, !!error && !on && styles.inputError]}>
                {on && <Check size={18} color={colors.onPrimary} strokeWidth={2.6} />}
                <Text weight={on ? 'bold' : 'semibold'} color={on ? colors.onPrimary : colors.text} numberOfLines={1}>
                  {o.label}
                </Text>
              </Touchable>
            );
          })}
        </View>
      </Field>
    );
  }

  const canSearch = searchable ?? options.length > SEARCH_FROM;
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter(o => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q)) : options;
  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const pick = (v: T) => {
    onChange(v);
    close();
  };

  return (
    <Field label={label} error={error} hint={hint} optional={optional}>
      <Touchable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder ?? tc('select')}`}
        style={[styles.inputWrap, styles.selectWrap, !!error && styles.inputError]}>
        <Text weight={current ? 'semibold' : 'regular'} color={current ? colors.text : ink[400]} style={styles.flex} numberOfLines={1}>
          {current?.label ?? placeholder ?? tc('select')}
        </Text>
        <ChevronDown size={20} color={ink[500]} />
      </Touchable>
      <Sheet visible={open} onClose={close} title={label || placeholder} scrollRef={scroll}>
        {canSearch && <TextField value={query} onChangeText={setQuery} placeholder={tm('search')} autoCorrect={false} accessibilityLabel={tm('search')} />}
        {shown.length === 0 && (
          <Text color={colors.textMuted} align="center" style={styles.noMatch}>
            {tm('noMatch')}
          </Text>
        )}
        <View style={columns ? styles.grid : styles.list}>
          {shown.map(o => {
            const on = o.value === value;
            return (
              <Touchable
                key={`${o.value}-${on ? 'on' : 'off'}`}
                onPress={() => pick(o.value)}
                // Bring the current choice into view when the sheet opens.
                onLayout={on && !q ? e => scroll.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 120), animated: false }) : undefined}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={o.description ? `${o.label}. ${o.description}` : o.label}
                style={
                  columns
                    ? [styles.cell, { width: `${100 / columns - 2}%` }, on ? styles.cellOn : styles.cellOff]
                    : [styles.option, on ? styles.optionOn : styles.optionOff]
                }>
                {columns ? (
                  <Text weight={on ? 'bold' : 'semibold'} color={on ? colors.onPrimary : colors.text} align="center" numberOfLines={1}>
                    {o.label}
                  </Text>
                ) : (
                  <>
                    <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                    <View style={styles.flex}>
                      <Text weight={on ? 'bold' : 'semibold'} color={on ? brand[800] : colors.text}>
                        {o.label}
                      </Text>
                      {!!o.description && (
                        <Text variant="small" color={colors.textMuted}>
                          {o.description}
                        </Text>
                      )}
                    </View>
                  </>
                )}
              </Touchable>
            );
          })}
        </View>
      </Sheet>
    </Field>
  );
}

/* ---- Toggle row ---------------------------------------------------------- */

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={styles.toggle}>
      <View style={styles.flex}>
        <Text weight="semibold">{label}</Text>
        {!!hint && (
          <Text variant="small" color={colors.textMuted}>
            {hint}
          </Text>
        )}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: brand[500], false: ink[300] }} thumbColor="#fff" />
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  field: { gap: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH + 4,
    borderWidth: 1.5,
    borderColor: ink[200],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
  },
  multilineWrap: { alignItems: 'flex-start', paddingVertical: space.sm },
  selectWrap: { gap: space.sm, overflow: 'hidden' },
  inputFocused: { borderColor: brand[500] },
  inputError: { borderColor: feedback.danger500 },
  input: { flex: 1, color: colors.text, paddingVertical: 10, paddingHorizontal: 4, includeFontPadding: false },
  multiline: { minHeight: 96 },
  prefix: { marginEnd: 4, writingDirection: 'ltr' },
  otpRow: { flexDirection: 'row', gap: space.sm, justifyContent: 'center', direction: 'ltr' },
  otpBox: {
    flex: 1,
    maxWidth: 52,
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: ink[200],
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpFilled: { borderColor: brand[300], backgroundColor: brand[50] },
  otpActive: { borderColor: brand[600], borderWidth: 2 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  list: { gap: space.xs },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.md, paddingVertical: space.md, borderRadius: radius.md, borderWidth: 1.5 },
  optionOn: { backgroundColor: brand[50], borderColor: brand[500] },
  optionOff: { backgroundColor: colors.surface, borderColor: 'transparent' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: ink[300], alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: brand[700] },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: brand[700] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'flex-start' },
  cell: { minHeight: 48, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xs, flexGrow: 0 },
  cellOn: { backgroundColor: brand[700], borderColor: brand[700] },
  cellOff: { backgroundColor: colors.surface, borderColor: ink[200] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TOUCH, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1.5 },
  choiceOn: { backgroundColor: brand[700], borderColor: brand[700] },
  choiceOff: { backgroundColor: colors.surface, borderColor: ink[200] },
  noMatch: { paddingVertical: space.lg },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingHorizontal: space.lg, paddingVertical: space.md },
}));
