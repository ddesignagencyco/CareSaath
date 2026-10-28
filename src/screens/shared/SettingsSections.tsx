import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { meApi as caregiverMe } from '../../api/caregiver/api';
import { meApi as customerMe } from '../../api/customer/api';
import { useAuth } from '../../auth/AuthContext';
import { Ambulance, Phone, Shield, SlidersHorizontal, type IconType } from '../../components/icons';
import { useToast } from '../../components/overlay';
import { Section } from '../../components/screen';
import { Text } from '../../components/Text';
import { Card, Divider, IconTile, ListRow, Segmented, Touchable, type TileTone } from '../../components/ui';
import { useSettings, useT, type Locale, type TextSize, type ThemePref } from '../../i18n';
import { colors, space, themed } from '../../theme';

/** Public emergency lines (SRS §9.2: clear escalation path in an emergency). */
const EMERGENCY: { key: 'rescue' | 'police' | 'edhi'; tel: string; icon: IconType; tone: TileTone }[] = [
  { key: 'rescue', tel: '1122', icon: Ambulance, tone: 'danger' },
  { key: 'police', tel: '15', icon: Shield, tone: 'teal' },
  { key: 'edhi', tel: '115', icon: Phone, tone: 'marigold' },
];

/** Language (SRS §2.5/§6), text size (§7.1) and appearance: the App preferences screen. */
export function PreferencesCard() {
  const t = useT('mobile.settings');
  const tl = useT('common.language');
  const { locale, setLocale, textSize, setTextSize, themePref, setThemePref } = useSettings();
  const { role } = useAuth();
  return (
    <Card style={styles.settings}>
      <View style={styles.group}>
        <Text weight="semibold">{t('language')}</Text>
        <Segmented<Locale>
          value={locale}
          onChange={l => {
            setLocale(l);
            // SMS / WhatsApp follow the server's preferredLanguage (best effort).
            const api = role === 'caregiver' ? caregiverMe : customerMe;
            if (role) api.update({ preferredLanguage: l === 'ur' ? 'UR' : 'EN' }).catch(() => undefined);
          }}
          options={[
            { value: 'en', label: tl('en') },
            { value: 'ur', label: tl('ur') },
          ]}
        />
        <Text variant="small" color={colors.textMuted}>
          {tl('hint')}
        </Text>
      </View>
      <Divider />
      <View style={styles.group}>
        <Text weight="semibold">{t('textSize')}</Text>
        <Segmented<TextSize>
          value={textSize}
          onChange={setTextSize}
          options={[
            { value: 'small', label: t('sizeSmall') },
            { value: 'medium', label: t('sizeMedium') },
            { value: 'large', label: t('sizeLarge') },
          ]}
        />
        <Text variant="small" color={colors.textMuted}>
          {t('textSizeHint')}
        </Text>
      </View>
      <Divider />
      <View style={styles.group}>
        <Text weight="semibold">{t('appearance')}</Text>
        <Segmented<ThemePref>
          value={themePref}
          onChange={setThemePref}
          options={[
            { value: 'system', label: t('themeSystem') },
            { value: 'light', label: t('themeLight') },
            { value: 'dark', label: t('themeDark') },
          ]}
        />
        <Text variant="small" color={colors.textMuted}>
          {t('appearanceHint')}
        </Text>
      </View>
    </Card>
  );
}

/** Emergency numbers (SRS §9.2), one tap to call. */
export function EmergencySection() {
  const t = useT('mobile.settings');
  const ts = useT('shared.sos');
  const toast = useToast();
  return (
    <Section title={t('help')}>
      <Text variant="small" color={colors.textMuted}>
        {t('helpHint')}
      </Text>
      <View style={styles.sosGrid}>
        {EMERGENCY.map(e => (
          <Touchable
            key={e.key}
            onPress={() => Linking.openURL(`tel:${e.tel}`).catch(() => toast.error(ts('callDirectly')))}
            accessibilityRole="button"
            accessibilityLabel={ts(e.key)}
            style={styles.sosTile}>
            <IconTile icon={e.icon} tone={e.tone} size={44} />
            <Text weight="bold" align="center" numberOfLines={1}>
              {ts(e.key)}
            </Text>
            <Text variant="caption" color={colors.textMuted} align="center" numberOfLines={2}>
              {ts(`${e.key}Note`)}
            </Text>
          </Touchable>
        ))}
      </View>
    </Section>
  );
}

/**
 * Bottom of Account (customer) / More (caregiver): a Settings section whose
 * App preferences row opens the preferences screen, then emergency numbers.
 */
export function SettingsSections() {
  const t = useT('mobile.settings');
  const nav = useNavigation<NativeStackNavigationProp<{ Settings: undefined }>>();
  return (
    <>
      <Section title={t('section')}>
        <Card padded={false}>
          <ListRow icon={SlidersHorizontal} tone="ink" title={t('preferences')} subtitle={t('preferencesHint')} onPress={() => nav.navigate('Settings')} />
        </Card>
      </Section>
      <EmergencySection />
    </>
  );
}

const styles = themed(() => StyleSheet.create({
  settings: { gap: space.lg },
  group: { gap: space.sm },
  sosGrid: { flexDirection: 'row', gap: space.sm },
  sosTile: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
}));
