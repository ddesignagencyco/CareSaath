import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native';
import { kv } from '../lib/storage';
import { setActiveScheme, type Scheme } from '../theme/colors';
import { formatIcu, stripTags, type Values } from './icu';
import { MESSAGES, type Messages } from './messages';

export type Locale = 'en' | 'ur';

const LANG_KEY = 'caresaath.settings.lang';
const SIZE_KEY = 'caresaath.settings.textSize';
const LEGACY_LARGE_KEY = 'caresaath.settings.largeText';
const THEME_KEY = 'caresaath.settings.theme';

/** 'system' follows the phone's dark mode setting. */
export type ThemePref = 'system' | 'light' | 'dark';

export type TextSize = 'small' | 'medium' | 'large';

/** Multiplier applied to every type size (SRS §7.1: large-text option). */
export const TEXT_SCALE: Record<TextSize, number> = { small: 0.9, medium: 1, large: 1.2 };

interface Settings {
  locale: Locale;
  isRTL: boolean;
  textSize: TextSize;
  /** Text scale factor for the chosen size. */
  textScale: number;
  /** Large size also grows buttons/touch targets. */
  largeText: boolean;
  /** Follows the phone's "remove animations" setting: no press-shrink or sliding sheets. */
  reduceMotion: boolean;
  themePref: ThemePref;
  /** The scheme in effect now (themePref resolved against the phone). */
  scheme: Scheme;
  setLocale: (l: Locale) => void;
  setTextSize: (s: TextSize) => void;
  setThemePref: (t: ThemePref) => void;
}

const SettingsContext = createContext<Settings | null>(null);

function initialSize(): TextSize {
  const v = kv.getItem(SIZE_KEY);
  if (v === 'small' || v === 'medium' || v === 'large') return v;
  // Earlier builds stored an on/off large-text switch.
  return kv.getItem(LEGACY_LARGE_KEY) === '1' ? 'large' : 'medium';
}

/** Must mount after hydrateStorage() so saved settings are read synchronously. */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => (kv.getItem(LANG_KEY) === 'ur' ? 'ur' : 'en'));
  const [textSize, setSizeState] = useState<TextSize>(initialSize);
  const [themePref, setThemeState] = useState<ThemePref>(() => {
    const v = kv.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  });
  // Native pickers, keyboard and system bars follow the app's choice too.
  // 'auto' is only sent to clear an override: calling it while already
  // following the phone stops Android reporting the phone's own changes.
  const overridden = useRef(false);
  useEffect(() => {
    if (themePref !== 'system') {
      Appearance.setColorScheme(themePref);
      overridden.current = true;
    } else if (overridden.current) {
      Appearance.setColorScheme('auto');
      overridden.current = false;
    }
  }, [themePref]);
  const system = useColorScheme();
  const scheme: Scheme = themePref === 'system' ? (system === 'dark' ? 'dark' : 'light') : themePref;
  // Set during render so every child reads the right palette on this pass.
  setActiveScheme(scheme);
  // The phone's own "remove animations" setting.
  const [systemReduce, setSystemReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduce).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduce);
    return () => sub.remove();
  }, []);

  const value = useMemo<Settings>(
    () => ({
      locale,
      isRTL: locale === 'ur',
      textSize,
      textScale: TEXT_SCALE[textSize],
      largeText: textSize === 'large',
      reduceMotion: systemReduce,
      themePref,
      scheme,
      setLocale: l => {
        kv.setItem(LANG_KEY, l);
        setLocaleState(l);
      },
      setTextSize: size => {
        kv.setItem(SIZE_KEY, size);
        setSizeState(size);
      },
      setThemePref: pref => {
        kv.setItem(THEME_KEY, pref);
        setThemeState(pref);
      },
    }),
    [locale, textSize, systemReduce, themePref, scheme],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}

function lookup(messages: Messages, path: string): string | undefined {
  let node: string | Messages | undefined = messages;
  for (const part of path.split('.')) {
    if (typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export type Translate = {
  (key: string, values?: Values): string;
  /** Keeps <b> tags for <RichText>. */
  raw: (key: string, values?: Values) => string;
  has: (key: string) => boolean;
};

/**
 * `useT('customerA')` scopes keys to a namespace, like next-intl's
 * useTranslations. Unknown keys render as the key so gaps are visible.
 */
export function useT(namespace?: string): Translate {
  const { locale } = useSettings();
  const make = useCallback(() => {
    const messages = MESSAGES[locale];
    const full = (key: string) => (namespace ? `${namespace}.${key}` : key);
    const raw = (key: string, values?: Values) => {
      const src = lookup(messages, full(key));
      return src === undefined ? full(key) : formatIcu(src, values);
    };
    const t = ((key: string, values?: Values) => stripTags(raw(key, values))) as Translate;
    t.raw = raw;
    t.has = key => lookup(messages, full(key)) !== undefined;
    return t;
  }, [locale, namespace]);
  return useMemo(make, [make]);
}
