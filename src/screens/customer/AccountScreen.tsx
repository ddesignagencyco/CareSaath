import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { meApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import { Bell, MapPin, Pencil, Phone, Users, Wallet, type IconType } from '../../components/icons';
import { ErrorState, Screen, Section, Skeleton } from '../../components/screen';
import { Text } from '../../components/Text';
import { Avatar, Button, Card, CountBadge, Divider, ListRow, type TileTone } from '../../components/ui';
import { useT } from '../../i18n';
import { useFmt } from '../../i18n/format';
import { formatPkMobile } from '../../lib/phone';
import { useQuery } from '../../lib/query';
import type { CustomerStack, CustomerTabs } from '../../navigation/types';
import { brand, colors, space, themed } from '../../theme';
import { SettingsSections } from '../shared/SettingsSections';
import { SignOutButton } from '../shared/SignOutButton';
import { useUnreadCount } from './HomeScreen';
import { Scale } from './components/icons';

type Props = CompositeScreenProps<BottomTabScreenProps<CustomerTabs, 'Account'>, NativeStackScreenProps<CustomerStack>>;

interface Link {
  key: string;
  title: string;
  icon: IconType;
  tone: TileTone;
  go: () => void;
  badge?: number;
}

export function AccountScreen({ navigation }: Props) {
  const t = useT('customerB.account');
  const tc = useT('common');
  const tp = useT('mobileCustomer.profile');
  const ta = useT('mobileCustomer.account');
  const f = useFmt();
  const me = useQuery(keys.me, () => meApi.get());
  const unread = useUnreadCount();

  const care: Link[] = [
    { key: 'patients', title: t('links.patients'), icon: Users, tone: 'teal', go: () => navigation.navigate('Patients') },
    { key: 'addresses', title: t('links.addresses'), icon: MapPin, tone: 'mint', go: () => navigation.navigate('Addresses') },
    { key: 'contacts', title: t('links.contacts'), icon: Phone, tone: 'danger', go: () => navigation.navigate('Contacts') },
  ];
  const account: Link[] = [
    { key: 'payments', title: t('links.payments'), icon: Wallet, tone: 'marigold', go: () => navigation.navigate('Payments') },
    { key: 'disputes', title: t('links.disputes'), icon: Scale, tone: 'sand', go: () => navigation.navigate('Disputes') },
    { key: 'notifications', title: tc('nav.notifications'), icon: Bell, tone: 'teal', badge: unread, go: () => navigation.navigate('Notifications') },
  ];

  const group = (links: Link[]) => (
    <Card padded={false}>
      {links.map((l, i) => (
        <View key={l.key}>
          {i > 0 && <Divider inset={space.lg + 40 + space.md} />}
          <ListRow icon={l.icon} tone={l.tone} title={l.title} onPress={l.go} right={l.badge ? <CountBadge count={l.badge} /> : undefined} />
        </View>
      ))}
    </Card>
  );

  return (
    <Screen title={t('title')} largeTitle refreshing={me.isFetching && !me.isLoading} onRefresh={me.refetch}>
      <Card style={styles.profile}>
        {me.error && !me.data ? (
          <ErrorState error={me.error} onRetry={me.refetch} />
        ) : !me.data ? (
          <Skeleton height={180} />
        ) : (
          <>
            <View style={styles.who}>
              <Avatar name={me.data.fullName || t('you')} size={72} />
              <View style={styles.flex}>
                <Text variant="title" weight="extrabold" numberOfLines={1}>
                  {me.data.fullName || t('addName')}
                </Text>
                <Text variant="small" color={colors.textMuted} numberOfLines={1}>
                  {formatPkMobile(me.data.phone)}
                </Text>
                <Text variant="caption" color={colors.textSubtle} numberOfLines={1}>
                  {t('memberSince', { date: f.date(me.data.createdAt) })}
                </Text>
              </View>
            </View>
            <Button label={tp('button')} icon={Pencil} variant="secondary" block onPress={() => navigation.navigate('EditProfile')} />
          </>
        )}
      </Card>

      <Section title={ta('careGroup')}>{group(care)}</Section>
      <Section title={ta('accountGroup')}>{group(account)}</Section>
      <SettingsSections />
      <SignOutButton />
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  profile: { gap: space.lg, backgroundColor: brand[50], borderColor: brand[100] },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
}));
