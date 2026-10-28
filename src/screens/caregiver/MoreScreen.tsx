import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { notificationsApi, profileApi } from '../../api/caregiver/api';
import { keys } from '../../api/caregiver/keys';
import { useAuth } from '../../auth/AuthContext';
import { BadgeCheck, Bell, CalendarDays, CircleUser, ClipboardList, ShieldCheck, Star, Wallet, type IconType } from '../../components/icons';
import { Screen, Section } from '../../components/screen';
import { Text } from '../../components/Text';
import { Card, CountBadge, DirChevron, Divider, ListRow, type TileTone, Touchable } from '../../components/ui';
import { useT } from '../../i18n';
import { formatPkMobile } from '../../lib/phone';
import { useQuery } from '../../lib/query';
import type { CaregiverStack, CaregiverTabs } from '../../navigation/types';
import { accent, brand, colors, ink, radius, shadow, space, themed } from '../../theme';
import { PhotoAvatar } from './components/Files';
import { SettingsSections } from '../shared/SettingsSections';
import { SignOutButton } from '../shared/SignOutButton';

type Props = CompositeScreenProps<BottomTabScreenProps<CaregiverTabs, 'More'>, NativeStackScreenProps<CaregiverStack>>;

export function MoreScreen({ navigation }: Props) {
  const tn = useT('caregiverA.nav');
  const ts = useT('caregiverA.shell');
  const tm = useT('mobileCaregiver.more');
  const tp = useT('caregiverB.profile');
  const { me } = useAuth();
  const unread = useQuery([...keys.notifications, 'unread'], () => notificationsApi.list({ channel: 'PUSH', unread: true, limit: 1 }));
  const profile = useQuery(keys.profile, profileApi.get);
  const photo = useQuery([...keys.profile, 'photo', profile.data?.photoKey], profileApi.photoUrl, { enabled: !!profile.data?.photoKey });
  const count = unread.data?.total ?? 0;
  const name = me?.fullName || ts('defaultName');
  const p = profile.data;

  return (
    <Screen title={tm('title')} largeTitle>
      <Touchable onPress={() => navigation.navigate('CgProfile')} accessibilityRole="button" accessibilityLabel={`${name}, ${tn('profile')}`} style={styles.me} pressScale={false}>
        <PhotoAvatar name={name} url={photo.data?.url} size={64} />
        <View style={styles.flex}>
          <Text variant="title" weight="extrabold" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="small" color={colors.textMuted} numberOfLines={1} style={styles.ltr}>
            {me ? formatPkMobile(me.phone) : ''}
          </Text>
          {p && (
            <View style={styles.meta}>
              {p.verificationStatus === 'APPROVED' && (
                <View style={styles.inline}>
                  <BadgeCheck size={15} color={brand[600]} />
                  <Text variant="caption" weight="semibold" color={brand[700]} numberOfLines={1}>
                    {tp('verified')}
                  </Text>
                </View>
              )}
              <View style={styles.inline}>
                <Star size={14} color={accent[500]} fill={accent[500]} />
                <Text variant="caption" weight="semibold" color={ink[700]} style={styles.ltr}>
                  {Number(p.ratingAverage).toFixed(1)}
                </Text>
              </View>
            </View>
          )}
        </View>
        <DirChevron color={brand[600]} />
      </Touchable>

      <Section title={tm('sectionWork')}>
        <MenuGroup
          rows={[
            { key: 'visits', icon: ClipboardList, tone: 'teal', title: tn('visits'), subtitle: tm('visitsHint'), go: () => navigation.navigate('Visits') },
            { key: 'earnings', icon: Wallet, tone: 'marigold', title: tn('earnings'), subtitle: tm('earningsHint'), go: () => navigation.navigate('Earnings') },
            { key: 'availability', icon: CalendarDays, tone: 'mint', title: tn('availability'), subtitle: tm('availabilityHint'), go: () => navigation.navigate('Availability') },
          ]}
        />
      </Section>

      <Section title={tm('sectionProfile')}>
        <MenuGroup
          rows={[
            { key: 'profile', icon: CircleUser, tone: 'teal', title: tn('profile'), subtitle: tm('profileHint'), go: () => navigation.navigate('CgProfile') },
            {
              key: 'notifications',
              icon: Bell,
              tone: 'marigold',
              title: tn('notifications'),
              right: count > 0 ? <CountBadge count={count} /> : undefined,
              go: () => navigation.navigate('CgNotifications'),
            },
            { key: 'reports', icon: ShieldCheck, tone: 'sand', title: tn('reports'), subtitle: tm('reportsHint'), go: () => navigation.navigate('Reports') },
          ]}
        />
      </Section>

      <SettingsSections />

      <SignOutButton />
    </Screen>
  );
}

type MenuItem = { key: string; icon: IconType; tone: TileTone; title: string; subtitle?: string; right?: React.ReactNode; go: () => void };

/** One card of menu rows: the shared ListRow with a toned icon tile, hairlines between. */
function MenuGroup({ rows }: { rows: MenuItem[] }) {
  return (
    <Card padded={false}>
      {rows.map((r, i) => (
        <View key={r.key}>
          {i > 0 && <Divider inset={space.lg + 40 + space.md} />}
          <ListRow icon={r.icon} tone={r.tone} title={r.title} subtitle={r.subtitle} right={r.right} onPress={r.go} />
        </View>
      ))}
    </Card>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  ltr: { writingDirection: 'ltr' },
  me: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.lg + 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: brand[100],
    ...shadow.card,
  },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md, marginTop: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
}));
