import React from 'react';
import { Text as RNText, type TextProps, type TextStyle, StyleSheet } from 'react-native';
import { colors, fonts, type as scale, type FontWeight, type TypeVariant } from '../theme';
import { useSettings } from '../i18n';
import { splitRich } from '../i18n/icu';


export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  weight?: FontWeight;
  color?: string;
  align?: TextStyle['textAlign'];
  /** Numbers that should not jump width while counting (timers, money). */
  tabular?: boolean;
  /**
   * Digits / codes / money: Latin face with exact metrics in every language
   * (Urdu's taller line box knocks numbers off-centre in circles and tiles),
   * always LTR, and one-line values shrink to fit instead of truncating.
   */
  numeric?: boolean;
}

/**
 * Urdu uses the phone's built-in Urdu font (chosen after trying Nastaliq,
 * Noto Sans Arabic and Gulzar: it read best on device). Weights are one step
 * lighter than Latin, since Arabic script reads heavier at the same weight.
 */
const SYSTEM_WEIGHT: Record<FontWeight, TextStyle['fontWeight']> = { regular: '400', medium: '400', semibold: '500', bold: '600', extrabold: '700' };

/**
 * Font family + size for the current language. Urdu: a touch larger than
 * Latin (Arabic glyphs read smaller), 1.6x line height for dots and
 * descenders, and no letter-spacing (spacing breaks the joins).
 */
export function useTextStyle(variant: TypeVariant = 'body', weight: FontWeight = 'regular'): TextStyle {
  const { locale, textScale: k } = useSettings();
  const s = scale[variant];
  if (locale === 'ur') {
    const size = Math.round(s.size * k * 1.05);
    return { fontFamily: undefined, fontWeight: SYSTEM_WEIGHT[weight], fontSize: size, lineHeight: Math.round(size * 1.6), letterSpacing: 0 };
  }
  return { fontFamily: fonts[weight], fontSize: Math.round(s.size * k), lineHeight: Math.round(s.line * k) };
}

/** Latin (Plus Jakarta) metrics regardless of language, scaled for large text. */
function useLatinStyle(variant: TypeVariant, weight: FontWeight): TextStyle {
  const { textScale: k } = useSettings();
  const s = scale[variant];
  return { fontFamily: fonts[weight], fontSize: Math.round(s.size * k), lineHeight: Math.round(s.line * k) };
}

export function Text({ variant = 'body', weight = 'regular', color = colors.text, align, tabular, numeric, style, ...rest }: AppTextProps) {
  const base = useTextStyle(variant, weight);
  const latin = useLatinStyle(variant, weight);
  const { isRTL } = useSettings();
  if (numeric) {
    return (
      <RNText
        {...(rest.numberOfLines === 1 ? { adjustsFontSizeToFit: true, minimumFontScale: 0.7 } : null)}
        {...rest}
        style={[latin, styles.numeric, { color, textAlign: align ?? (isRTL ? 'right' : 'left') }, tabular && styles.tabular, style]}
      />
    );
  }
  // One-line text shrinks a little before it truncates (Urdu runs wider, so a bit more).
  const fit = rest.numberOfLines === 1 ? { adjustsFontSizeToFit: true, minimumFontScale: isRTL ? 0.8 : 0.85 } : null;
  const forcedLtr = StyleSheet.flatten(style)?.writingDirection === 'ltr';
  return (
    <RNText
      {...fit}
      {...rest}
      children={isRTL ? (forcedLtr ? withDirMark(rest.children, LRM) : withDirMark(latinRuns(rest.children, latin.fontFamily as string), RLM)) : rest.children}
      style={[
        base,
        // Urdu: 'auto' = the paragraph's own start, i.e. right. Android reads
        // 'right' relative to an RTL paragraph and would push it left.
        { color, textAlign: align ?? (isRTL ? 'auto' : 'left'), writingDirection: isRTL ? 'rtl' : 'ltr' },
        tabular && styles.tabular,
        style,
      ]}
    />
  );
}

/** Renders a message that contains <b>…</b> runs (from t.raw). */
export function RichText({ children, boldColor, ...props }: Omit<AppTextProps, 'children'> & { children: string; boldColor?: string }) {
  const bold = useTextStyle(props.variant, 'bold');
  return (
    <Text {...props}>
      {splitRich(children).map((p, i) =>
        p.bold ? (
          <RNText key={i} style={[{ fontFamily: bold.fontFamily }, boldColor ? { color: boldColor } : null]}>
            {p.text}
          </RNText>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
}

/*
 * Android ignores `writingDirection` and takes a paragraph's direction from
 * its first strong letter, so an Urdu line that starts with "Rs", "SOS" or a
 * name was laid out left-to-right (wrong word order). A leading direction mark
 * pins it. Numbers/money/times inside carry their own LTR isolates.
 */
const RLM = '‏';
const LRM = '‎';

/** Arabic-script letters (Urdu); anything else in a run is drawn in the Latin face. */
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
/** A Latin/digit run: starts with a letter or digit, may contain spaces and common punctuation. */
const LATIN_RUN = /([A-Za-z0-9][A-Za-z0-9 .,:;!?'’"\-–—/&()+@#%*]*[A-Za-z0-9.)%]|[A-Za-z0-9])/g;

/**
 * The Urdu face's Latin glyphs don't match the app; inside Urdu text, names, times and
 * digits ("Fatima Noor", "9:00 AM", "14") are drawn in Plus Jakarta instead,
 * as nested spans so the line still wraps and aligns as one RTL paragraph.
 */
function latinRuns(children: React.ReactNode, latinFamily: string): React.ReactNode {
  const split = (text: string, key: string): React.ReactNode => {
    if (!ARABIC.test(text)) return <RNText key={key} style={{ fontFamily: latinFamily }}>{text}</RNText>;
    const parts = text.split(LATIN_RUN);
    if (parts.length === 1) return text;
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <RNText key={`${key}-${i}`} style={{ fontFamily: latinFamily }}>
          {part}
        </RNText>
      ) : (
        part
      ),
    );
  };
  if (typeof children === 'string') return split(children, 'r');
  if (typeof children === 'number') return split(String(children), 'r');
  if (Array.isArray(children)) return children.map((c, i) => (typeof c === 'string' || typeof c === 'number' ? split(String(c), `r${i}`) : c));
  return children;
}

function withDirMark(children: React.ReactNode, mark: string): React.ReactNode {
  if (typeof children === 'string' || typeof children === 'number') return mark + String(children);
  if (Array.isArray(children)) return [mark, ...children];
  // A single element (e.g. one Latin span): still lead with the mark.
  return children === null || children === undefined || children === false ? children : [mark, children];
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  numeric: { includeFontPadding: false, writingDirection: 'ltr' },
});
