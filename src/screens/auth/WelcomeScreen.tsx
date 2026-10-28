import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { USE_MOCKS } from '../../api/config';
import { FeatureIcon, HeroBand } from '../../components/brand';
import { HandHeart, Languages, ShieldCheck, Stethoscope, type IconType } from '../../components/icons';
import { LogoMark, Wordmark } from '../../components/Logo';
import { Text } from '../../components/Text';
import { DirChevron, Touchable, BUTTON_HEIGHT } from '../../components/ui';
import { useSettings, useT } from '../../i18n';
import type { AuthScreen } from '../../navigation/types';
import { accent, brand, colors, ink, radius, shadow, space, themed, brandFixed } from '../../theme';

const OVERLAP = 32;

/**
 * First screen. The teal band carries the brand; the choice that matters
 * (who are you?) sits low, in thumb reach, as two large cards on a panel that
 * rises over the band, so nobody lands in the wrong app.
 */
export function WelcomeScreen({ navigation }: AuthScreen<'Welcome'>) {
  const insets = useSafeAreaInsets();
  const t = useT('mobile.welcome');
  const tl = useT('customerA.login.features');
  const { locale, setLocale } = useSettings();

  return (
    <View style={styles.root}>
      <HeroBand overlap={OVERLAP} style={styles.hero}>
        <View style={styles.brandRow}>
          <LogoMark size={44} variant="onDark" />
          <Wordmark size={26} light />
        </View>
        <Text variant="display" weight="extrabold" color="#fff" style={styles.tagline}>
          {t('tagline')}
        </Text>
        <View style={styles.trust}>
          <ShieldCheck size={20} color={accent[400]} strokeWidth={2.2} />
          <Text variant="small" color={brandFixed[100]} style={styles.flex}>
            {tl('verified.text')}
          </Text>
        </View>
        <Text variant="title" weight="bold" color="#fff" accessibilityRole="header" style={styles.question}>
          {t('whoAreYou')}
        </Text>
      </HeroBand>

      <ScrollView style={styles.panel} contentContainerStyle={[styles.panelContent, { paddingBottom: insets.bottom + space.xl }]} bounces={false}>
        <RoleCard icon={Stethoscope} tone="teal" title={t('customerTitle')} text={t('customerText')} onPress={() => navigation.navigate('Login', { intent: 'customer' })} />
        <RoleCard icon={HandHeart} tone="marigold" title={t('caregiverTitle')} text={t('caregiverText')} onPress={() => navigation.navigate('Login', { intent: 'caregiver' })} />

        <Touchable onPress={() => setLocale(locale === 'en' ? 'ur' : 'en')} accessibilityRole="button" style={styles.lang}>
          <Languages size={20} color={brand[700]} />
          <Text weight="semibold" color={brand[700]} style={locale === 'en' ? styles.urduLabel : undefined}>
            {t('language')}
          </Text>
        </Touchable>

        {USE_MOCKS && (
          <Text variant="caption" color={ink[400]} align="center">
            {t('mockNote')}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function RoleCard({ icon, tone, title, text, onPress }: { icon: IconType; tone: 'teal' | 'marigold'; title: string; text: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${text}`} style={styles.card}>
      <FeatureIcon icon={icon} tone={tone} size={60} />
      <View style={styles.flex}>
        <Text variant="lead" weight="bold">
          {title}
        </Text>
        <Text variant="small" color={colors.textMuted}>
          {text}
        </Text>
      </View>
      <View style={styles.go}>
        <DirChevron color={brand[700]} size={20} />
      </View>
    </Touchable>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { gap: space.xl, paddingHorizontal: space.xxl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, direction: 'ltr', marginTop: space.sm },
  tagline: { letterSpacing: -0.8 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  question: { marginTop: space.lg },
  panel: { flex: 1, marginTop: -OVERLAP },
  panelContent: { paddingHorizontal: space.lg, gap: space.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    minHeight: 96,
    borderRadius: radius.lg + 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ink[100],
    ...shadow.pop,
  },
  go: { width: 36, height: 36, borderRadius: 18, backgroundColor: brand[50], alignItems: 'center', justifyContent: 'center' },
  lang: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: BUTTON_HEIGHT, borderRadius: radius.md, marginTop: space.sm },
  // System Urdu font for the "اردو میں جاری رکھیں" link (Jakarta has no Arabic glyphs).
  urduLabel: { fontFamily: undefined, fontWeight: '500', lineHeight: 26 },
}));
