import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { caregiversApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import type { CaregiverSearchItem, Specialty } from '../../api/types';
import { Select } from '../../components/form';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Activity, Bandage, Stethoscope, type IconType } from '../../components/icons';
import { Button, Chip, HScroll } from '../../components/ui';
import { useT } from '../../i18n';
import { useLabels } from '../../i18n/format';
import { useQuery } from '../../lib/query';
import type { CustomerStack, CustomerTabs } from '../../navigation/types';
import { brand, colors, space } from '../../theme';
import { CITIES, CaregiverCard } from './components/bits';
import { HeartHandshake, SearchX } from './components/icons';

type Props = CompositeScreenProps<BottomTabScreenProps<CustomerTabs, 'FindCare'>, NativeStackScreenProps<CustomerStack>>;

const SPECIALTIES: (Specialty | 'ALL')[] = ['ALL', 'NURSING', 'PHYSIOTHERAPY', 'POST_SURGERY_CARE', 'ELDERLY_CARE'];
const CHIP_ICON: Record<Specialty, IconType> = { NURSING: Stethoscope, PHYSIOTHERAPY: Activity, POST_SURGERY_CARE: Bandage, ELDERLY_CARE: HeartHandshake };
const PAGE = 20;
const ALL_CITIES = '__all';

/** FR-C3: search approved caregivers by specialty and city. */
export function FindCareScreen({ navigation, route }: Props) {
  const t = useT('customerA.find');
  const tm = useT('mobileCustomer.find');
  const L = useLabels();
  const [specialty, setSpecialty] = useState<Specialty | 'ALL'>(route.params?.specialty ?? 'ALL');
  const [city, setCity] = useState<string>(ALL_CITIES);
  const [limit, setLimit] = useState(PAGE);

  // Home's service tiles navigate here with a specialty.
  useEffect(() => {
    if (route.params?.specialty) {
      setSpecialty(route.params.specialty);
      setLimit(PAGE);
    }
  }, [route.params?.specialty]);

  const results = useQuery([...keys.caregivers, 'search', specialty, city, limit], () =>
    caregiversApi.search({ specialty: specialty === 'ALL' ? undefined : specialty, city: city === ALL_CITIES ? undefined : city, page: 1, limit }),
  );

  const open = useCallback((id: string) => navigation.navigate('CaregiverProfile', { id }), [navigation]);
  const renderItem = useCallback(({ item }: { item: CaregiverSearchItem }) => <CaregiverCard c={item} onPress={open} />, [open]);
  const data = results.data;

  const header = (
    <View style={styles.header}>
      {/* Chips bleed to the screen edges and start at the reading edge (HScroll). */}
      <HScroll style={styles.chipsBleed} contentContainerStyle={styles.chips}>
        {SPECIALTIES.map(s => (
          <Chip
            key={s}
            label={s === 'ALL' ? t('all') : L.specialty(s)}
            icon={s === 'ALL' ? undefined : CHIP_ICON[s]}
            selected={specialty === s}
            onPress={() => {
              setSpecialty(s);
              setLimit(PAGE);
            }}
          />
        ))}
      </HScroll>
      <Select
        label={t('city')}
        value={city}
        onChange={v => {
          setCity(v);
          setLimit(PAGE);
        }}
        options={[{ value: ALL_CITIES, label: t('allCities') }, ...CITIES.map(c => ({ value: c, label: c }))]}
      />
      {!!data && data.items.length > 0 && (
        <Text variant="small" color={colors.textMuted}>
          {city !== ALL_CITIES ? t('countInCity', { count: data.total, city }) : t('count', { count: data.total })}
        </Text>
      )}
    </View>
  );

  return (
    <Screen title={t('title')} subtitle={t('description')} largeTitle scroll={false}>
      {results.error && !data ? (
        <>
          {header}
          <ErrorState error={results.error} onRetry={results.refetch} />
        </>
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={c => c.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={Separator}
          refreshControl={<RefreshControl refreshing={results.isFetching && !results.isLoading} onRefresh={results.refetch} colors={[brand[600]]} />}
          ListEmptyComponent={results.isLoading ? <SkeletonList count={3} height={180} /> : <EmptyState icon={SearchX} title={t('emptyTitle')} text={t('emptyText')} />}
          ListFooterComponent={
            data && data.total > data.items.length ? (
              <Button label={tm('loadMore')} variant="secondary" loading={results.isFetching} onPress={() => setLimit(l => l + PAGE)} style={styles.more} />
            ) : undefined
          }
          removeClippedSubviews
          windowSize={7}
        />
      )}
    </Screen>
  );
}

const Separator = () => <View style={styles.sep} />;

const styles = StyleSheet.create({
  header: { gap: space.md, paddingBottom: space.md },
  chipsBleed: { marginHorizontal: -space.lg },
  chips: { gap: space.sm, paddingVertical: 2, paddingHorizontal: space.lg },
  list: { padding: space.lg, paddingBottom: space.xxxl },
  sep: { height: space.md },
  more: { marginTop: space.lg },
});
