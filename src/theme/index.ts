import { Platform } from 'react-native';

export * from './colors';

/** 4-pt spacing scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/**
 * Radii carry hierarchy: inputs and chips are tighter than cards, and the
 * sheet/hero surfaces are the roundest. Not one radius on everything.
 */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Minimum touch target (Android 48dp; also clears iOS 44pt). */
export const TOUCH = 48;

export const fonts = {
  regular: 'PlusJakartaSans-Regular',
  medium: 'PlusJakartaSans-Medium',
  semibold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  extrabold: 'PlusJakartaSans-ExtraBold',
} as const;

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

/**
 * Type scale (size / line height). Ratio ~1.2 so the steps read as distinct
 * on small screens. Large-text mode multiplies these (see TextScale).
 */
export const type = {
  caption: { size: 12, line: 16 },
  small: { size: 14, line: 20 },
  body: { size: 16, line: 24 },
  lead: { size: 18, line: 26 },
  title: { size: 20, line: 28 },
  h2: { size: 24, line: 32 },
  h1: { size: 30, line: 38 },
  display: { size: 36, line: 42 },
} as const;

export type TypeVariant = keyof typeof type;

export const shadow = {
  card: Platform.select({
    ios: {
      shadowColor: '#141a18',
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    default: { elevation: 1 },
  }),
  pop: Platform.select({
    ios: {
      shadowColor: '#141a18',
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    default: { elevation: 8 },
  }),
};
