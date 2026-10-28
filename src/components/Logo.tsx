import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { accent, brand, colors, fonts, themed } from '../theme';
import { Text } from './Text';

/*
 * The CareSaath mark: two halves of a heart ("saath" = together) meeting at
 * the top, with two heads above. Same geometry as the web brand loader
 * (CareSath/frontend/src/shared/ui/brand-loader.tsx).
 */
const LEFT = 'M24 38 C16.5 32.5 11 27.8 11 22.4 C11 18.6 13.8 16.2 17 16.2 C20 16.2 22.6 18 24 20.8';
const RIGHT = 'M24 38 C31.5 32.5 37 27.8 37 22.4 C37 18.6 34.2 16.2 31 16.2 C28 16.2 25.4 18 24 20.8';

/**
 * `tile`: white + marigold on a teal rounded tile (app icon look).
 * `onDark`: white + marigold, no tile — for the teal hero bands.
 * `onLight`: teal + marigold, no tile — for light surfaces.
 */
export type LogoVariant = 'tile' | 'onDark' | 'onLight';

function ink(variant: LogoVariant) {
  return variant === 'onLight' ? brand[700] : '#fff';
}

export function LogoMark({ size = 48, variant = 'tile' }: { size?: number; variant?: LogoVariant }) {
  const c = ink(variant);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityRole="image" accessibilityLabel="Care Sath">
      {variant === 'tile' && <Rect width={48} height={48} rx={14} fill={brand[700]} />}
      <Path d={LEFT} stroke={c} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={RIGHT} stroke={accent[400]} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={17} cy={9.6} r={3.3} fill={c} />
      <Circle cx={31} cy={9.6} r={3.3} fill={accent[400]} />
    </Svg>
  );
}

/** "Care Sath" wordmark. Always LTR Latin, in both languages. */
export function Wordmark({ size = 22, light }: { size?: number; light?: boolean }) {
  const line = { fontFamily: fonts.extrabold, fontSize: size, lineHeight: Math.round(size * 1.25) };
  return (
    <Text style={[line, styles.wordmark]} color={light ? '#fff' : colors.text} align="left">
      {'Care '}
      <Text style={line} color={light ? accent[400] : brand[600]}>
        Sath
      </Text>
    </Text>
  );
}

/** Global loader: the still mark and wordmark with a small spinner (no logo animation, by request). */
export function BrandLoader({ fullScreen = true }: { fullScreen?: boolean }) {
  return (
    <View style={[styles.loader, fullScreen && styles.full]} accessibilityRole="progressbar" accessibilityLabel="Loading">
      <LogoMark size={64} />
      <Wordmark size={20} />
      <ActivityIndicator color={brand[600]} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wordmark: { letterSpacing: -0.4, writingDirection: 'ltr' },
  loader: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 48 },
  full: { flex: 1, backgroundColor: colors.bg },
}));
