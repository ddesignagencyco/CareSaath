import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { addressesApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import type { Address } from '../../api/types';
import { MapPin, Pencil, Plus, Trash } from '../../components/icons';
import { ConfirmSheet, useToast } from '../../components/overlay';
import { EmptyState, ErrorState, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Button, Card, IconButton, IconTile } from '../../components/ui';
import { useT } from '../../i18n';
import { useAction, useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { colors, feedback, space } from '../../theme';

/** FR-C7: saved places where caregivers visit. */
export function AddressesScreen({ navigation }: CustomerScreen<'Addresses'>) {
  const t = useT('customerB.addresses');
  const addresses = useQuery(keys.addresses, () => addressesApi.list());
  const [removing, setRemoving] = useState<Address | null>(null);
  const toast = useToast();
  const remove = useAction((a: Address) => addressesApi.remove(a.id), {
    invalidate: [keys.addresses],
    success: t('removed'),
    onSuccess: () => setRemoving(null),
    onError: err => {
      setRemoving(null);
      if (/booking/i.test(err.message)) {
        toast.error(t('hasBookings'));
        return true;
      }
    },
  });

  return (
    <Screen
      title={t('title')}
      back
      refreshing={addresses.isFetching && !addresses.isLoading}
      onRefresh={addresses.refetch}
      footer={<Button label={t('add')} icon={Plus} size="lg" block onPress={() => navigation.navigate('AddressForm')} />}>
      <Text color={colors.textMuted}>{t('description')}</Text>
      {addresses.error && !addresses.data ? (
        <ErrorState error={addresses.error} onRetry={addresses.refetch} />
      ) : !addresses.data ? (
        <SkeletonList count={2} height={96} />
      ) : addresses.data.length === 0 ? (
        <EmptyState title={t('emptyTitle')} text={t('emptyHint')} />
      ) : (
        addresses.data.map(a => (
          <Card key={a.id} style={styles.row}>
            <IconTile icon={MapPin} tone="mint" />
            <View style={styles.flex}>
              <Text weight="bold" numberOfLines={1}>
                {a.label || a.city}
              </Text>
              <Text variant="small" color={colors.textMuted}>
                {a.addressLine}, {a.city}
              </Text>
            </View>
            <IconButton icon={Pencil} label={t('editLabel')} onPress={() => navigation.navigate('AddressForm', { id: a.id })} size={20} />
            <IconButton icon={Trash} label={t('removeLabel')} onPress={() => setRemoving(a)} size={20} color={feedback.danger600} />
          </Card>
        ))
      )}
      <ConfirmSheet
        visible={!!removing}
        title={t('removeConfirmTitle')}
        body={t('removeConfirmBody')}
        confirmLabel={t('removeConfirm')}
        danger
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.run(removing)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
