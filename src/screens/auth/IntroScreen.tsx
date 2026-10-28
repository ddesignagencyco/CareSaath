import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { HeroBand } from '../../components/brand';
import { BadgeCheck, Navigation, ShieldCheck, Siren, type IconType } from '../../components/icons';
import { LogoMark } from '../../components/Logo';
import { Text } from '../../components/Text';
import { Button, Touchable } from '../../components/ui';
import { useSettings, useT } from '../../i18n';
import { kv } from '../../lib/storage';
import type { AuthScreen } from '../../navigation/types';
import { accent, brand, colors, ink, radius, shadow, space, themed, brandFixed, inkFixed } from '../../theme';

export const INTRO_SEEN_KEY = 'caresaath.app.introSeen';

type Slide = { key: 'verified' | 'track' | 'safety'; icon: IconType; chipIcon: IconType; chip: string; tint: string };

/**
 * First-launch intro, shown once. Three slides on the promises that matter
 * to a family letting a stranger into the home. Swipe or Next; Skip any time.
 * Slides move by state (not a paging ScrollView) so RTL needs no special case.
 */
export function IntroScreen({ navigation }: AuthScreen<'Intro'>) {
  const t = useT('mobile.intro');
  const tf = useT('customerA.login.features');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isRTL } = useSettings();
  const [index, setIndex] = useState(0);
  const anim = useRef(new Animated.Value(1)).current;
  const dirRef = useRef(1);

  const slides: Slide[] = useMemo(
    () => [
      { key: 'verified', icon: ShieldCheck, chipIcon: BadgeCheck, chip: t('chipVerified'), tint: brand[300] },
      { key: 'track', icon: Navigation, chipIcon: Navigation, chip: t('chipOnTheWay'), tint: accent[400] },
      { key: 'safety', icon: Siren, chipIcon: Siren, chip: t('chipSos'), tint: '#fca5a5' },
    ],
    [t],
  );
  const last = index === slides.length - 1;

  const finish = () => {
    kv.setItem(INTRO_SEEN_KEY, '1');
    navigation.replace('Login');
  };

  const go = (next: number) => {
    if (next < 0 || next >= slides.length || next === index) return;
    dirRef.current = next > index ? 1 : -1;
    setIndex(next);
  };

  // Enter animation for each new slide: slide in from the reading direction + fade.
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [index, anim]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < 50) return;
        // Swiping against the reading direction moves forward.
        const forward = isRTLRef.current ? g.dx > 0 : g.dx < 0;
        goRef.current(indexRef.current + (forward ? 1 : -1));
      },
    }),
  ).current;
  const isRTLRef = useRef(isRTL);
  const goRef = useRef(go);
  const indexRef = useRef(index);
  isRTLRef.current = isRTL;
  goRef.current = go;
  indexRef.current = index;

  const slide = slides[index];
  const shift = (isRTL ? -1 : 1) * dirRef.current * width * 0.25;
  const enter = {
    opacity: anim,
    transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }],
  };

  return (
    <View style={styles.root} {...pan.panHandlers}>
      <HeroBand style={styles.stage}>
        <View style={styles.topRow}>
          <LogoMark size={36} variant="onDark" />
          <View style={styles.flex} />
          {!last && (
            <Touchable onPress={finish} accessibilityRole="button" style={styles.skip}>
              <Text weight="semibold" color={brandFixed[100]}>
                {t('skip')}
              </Text>
            </Touchable>
          )}
        </View>
        <Animated.View style={[styles.art, enter]}>
          <SlideArt slide={slide} />
        </Animated.View>
      </HeroBand>

      <View style={[styles.body, { paddingBottom: insets.bottom + space.lg }]}>
        {/* Copy scrolls on short screens (taller Urdu lines); progress + button stay pinned. */}
        <ScrollView style={styles.flex} contentContainerStyle={styles.copyScroll} showsVerticalScrollIndicator={false} bounces={false}>
        <Animated.View style={[styles.copy, enter]}>
          <Text variant="h1" weight="extrabold" style={styles.title} accessibilityRole="header">
            {tf(`${slide.key}.title`)}
          </Text>
          <Text variant="lead" color={colors.textMuted}>
            {tf(`${slide.key}.text`)}
          </Text>
        </Animated.View>
        </ScrollView>

        <View style={styles.progress} accessibilityLabel={t('slide', { n: index + 1, total: slides.length })}>
          {slides.map((s, i) => (
            <Touchable key={s.key} onPress={() => go(i)} pressScale={false} accessibilityRole="button" accessibilityLabel={t('slide', { n: i + 1, total: slides.length })} style={styles.segHit}>
              <View style={[styles.seg, i === index ? styles.segOn : i < index ? styles.segDone : null]} />
            </Touchable>
          ))}
        </View>

        <Button label={last ? t('start') : t('next')} size="lg" block onPress={() => (last ? finish() : go(index + 1))} />
      </View>
    </View>
  );
}

/** Concentric rings, a big icon, the logo's heart and a status chip. */
function SlideArt({ slide }: { slide: Slide }) {
  const Icon = slide.icon;
  const Chip = slide.chipIcon;
  const left = 'M24 38 C16.5 32.5 11 27.8 11 22.4 C11 18.6 13.8 16.2 17 16.2 C20 16.2 22.6 18 24 20.8';
  const right = 'M24 38 C31.5 32.5 37 27.8 37 22.4 C37 18.6 34.2 16.2 31 16.2 C28 16.2 25.4 18 24 20.8';
  return (
    <View style={styles.artBox}>
      <Svg width={240} height={240} viewBox="0 0 240 240" style={StyleSheet.absoluteFill}>
        <Circle cx={120} cy={120} r={118} fill="#fff" fillOpacity={0.05} />
        <Circle cx={120} cy={120} r={88} fill="#fff" fillOpacity={0.07} />
        <Circle cx={120} cy={120} r={60} fill="#fff" fillOpacity={0.1} />
        <Path d={left} transform="translate(150 150) scale(1.6)" stroke="#fff" strokeOpacity={0.5} strokeWidth={3} fill="none" strokeLinecap="round" />
        <Path d={right} transform="translate(150 150) scale(1.6)" stroke={accent[400]} strokeWidth={3} fill="none" strokeLinecap="round" />
      </Svg>
      <View style={styles.iconDisc}>
        <Icon size={52} color={brandFixed[800]} strokeWidth={1.9} />
      </View>
      <View style={styles.chip}>
        <Chip size={16} color={slide.tint === '#fca5a5' ? '#dc2626' : brandFixed[700]} strokeWidth={2.4} />
        <Text variant="small" weight="bold" color={inkFixed[800]} numberOfLines={1} style={styles.shrink}>
          {slide.chip}
        </Text>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  root: { flex: 1, backgroundColor: colors.bg },
  stage: { flex: 1.15, paddingHorizontal: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  skip: { minHeight: 44, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.12)' },
  art: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  artBox: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  iconDisc: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.pop },
  chip: {
    position: 'absolute',
    bottom: 22,
    start: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    maxWidth: 220,
    ...shadow.pop,
  },
  body: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.xxl, gap: space.xl },
  copy: { gap: space.md },
  copyScroll: { flexGrow: 1 },
  title: { letterSpacing: -0.6 },
  progress: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  segHit: { paddingVertical: space.md, borderRadius: radius.pill },
  seg: { width: 18, height: 6, borderRadius: 3, backgroundColor: ink[200] },
  segOn: { width: 40, backgroundColor: brand[700] },
  segDone: { backgroundColor: brand[300] },
}));
