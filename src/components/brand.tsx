import React, { useCallback } from 'react';
import { StatusBar, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { IconType } from './icons';
import { accent, brand, radius, space, themed, brandFixed, accentFixed } from '../theme';
import { useSettings } from '../i18n';

/**
 * Brand surfaces. The one place the app is loud: a deep-teal band whose
 * texture is the logo's own heart strokes, drawn large and faint. Used at the
 * top of the role home screens and on the live-visit card, nowhere else.
 */

/** The two heart halves from the logo, as a repeatable faint texture. */
function HeartTexture({ width, height }: { width: number; height: number }) {
  const left = 'M24 38 C16.5 32.5 11 27.8 11 22.4 C11 18.6 13.8 16.2 17 16.2 C20 16.2 22.6 18 24 20.8';
  const right = 'M24 38 C31.5 32.5 37 27.8 37 22.4 C37 18.6 34.2 16.2 31 16.2 C28 16.2 25.4 18 24 20.8';
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="band" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={brandFixed[700]} />
          <Stop offset="0.55" stopColor={brandFixed[800]} />
          <Stop offset="1" stopColor={brandFixed[950]} />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#band)" />
      {/* Oversized mark bleeding off the end edge; marigold half kept faint. */}
      <Path d={left} transform={`translate(${width - 150} -40) scale(6)`} stroke="#fff" strokeOpacity={0.07} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Path d={right} transform={`translate(${width - 150} -40) scale(6)`} stroke={accentFixed[400]} strokeOpacity={0.16} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Circle cx={width - 48} cy={18} r={3.3 * 6} fill="#fff" fillOpacity={0.05} />
    </Svg>
  );
}

/**
 * Deep-teal header band with rounded bottom corners. Children render in
 * white on top; `overlap` reserves space for a card that floats over the
 * bottom edge (rendered by the screen right after the band, with a negative
 * margin of the same size).
 */
export function HeroBand({ children, overlap = 0, style }: { children: React.ReactNode; overlap?: number; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const { isRTL } = useSettings();
  useLightStatusBar();
  return (
    <View
      style={[styles.band, { paddingTop: insets.top + space.lg, paddingBottom: space.xxl + overlap }, style]}
      onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 && (
        // Texture is drawn for LTR; mirror it so the mark bleeds off the reading end.
        <View style={[StyleSheet.absoluteFill, isRTL && styles.mirror]} pointerEvents="none">
          <HeartTexture width={size.w} height={size.h} />
        </View>
      )}
      {children}
    </View>
  );
}

/**
 * Light status-bar icons over the teal band. Set on focus and never reset on
 * blur: every screen starts with the band, and a blur reset could land after
 * the next screen's focus and leave dark icons on teal.
 */
export function useLightStatusBar() {
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle('light-content', true);
    }, []),
  );
}

/**
 * Empty-state illustration: the logo's two figures in soft concentric
 * circles. Friendlier than a bare inbox icon, and still on-brand.
 */
export function CareIllustration({ size = 120 }: { size?: number }) {
  const left = 'M24 38 C16.5 32.5 11 27.8 11 22.4 C11 18.6 13.8 16.2 17 16.2 C20 16.2 22.6 18 24 20.8';
  const right = 'M24 38 C31.5 32.5 37 27.8 37 22.4 C37 18.6 34.2 16.2 31 16.2 C28 16.2 25.4 18 24 20.8';
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={60} cy={60} r={58} fill={brand[50]} />
      <Circle cx={60} cy={60} r={42} fill={brand[100]} />
      <Path d={left} transform="translate(30 26) scale(1.25)" stroke={brand[700]} strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={right} transform="translate(30 26) scale(1.25)" stroke={accent[500]} strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={30 + 17 * 1.25} cy={26 + 9.6 * 1.25} r={4} fill={brand[700]} />
      <Circle cx={30 + 31 * 1.25} cy={26 + 9.6 * 1.25} r={4} fill={accent[500]} />
      <Circle cx={100} cy={26} r={5} fill={accent[200]} />
      <Circle cx={18} cy={88} r={3.5} fill={brand[300]} />
    </Svg>
  );
}

/**
 * Hero-grade icon: gradient squircle with a soft top highlight and a white
 * icon. For the few places an icon introduces a whole path (role choice),
 * not for list rows (those use IconTile).
 */
export function FeatureIcon({ icon: Icon, tone = 'teal', size = 60 }: { icon: IconType; tone?: 'teal' | 'marigold'; size?: number }) {
  const [from, to] = tone === 'teal' ? [brandFixed[500], brandFixed[800]] : [accentFixed[400], accentFixed[600]];
  const id = `fi-${tone}`;
  const r = Math.round(size * 0.3);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} rx={r} fill={`url(#${id})`} />
        <Circle cx={size * 0.82} cy={size * 0.12} r={size * 0.32} fill="#fff" fillOpacity={0.14} />
      </Svg>
      <View style={styles.featureIcon}>
        <Icon size={Math.round(size * 0.48)} color="#fff" strokeWidth={2.1} />
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  featureIcon: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, alignItems: 'center', justifyContent: 'center' },
  band: {
    paddingHorizontal: space.xl,
    borderBottomLeftRadius: radius.xl + 4,
    borderBottomRightRadius: radius.xl + 4,
    overflow: 'hidden',
    backgroundColor: brandFixed[800],
  },
  mirror: { transform: [{ scaleX: -1 }] },
}));
