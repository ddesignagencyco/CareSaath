import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { addressesApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import type { Address } from '../../api/types';
import { Select, TextField } from '../../components/form';
import { useDeviceErrorText } from '../../components/FilePickerSheet';
import { MapPicker } from '../../components/MapPicker';
import { useToast } from '../../components/overlay';
import { coord, getDeviceLocation } from '../../lib/location';
import { LocateFixed } from './components/icons';
import { ErrorState, Screen, Skeleton } from '../../components/screen';
import { Text } from '../../components/Text';
import { Button, Card } from '../../components/ui';
import { useT } from '../../i18n';
import { useAction, useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { colors, ink, space, themed } from '../../theme';
import { CITIES, CITY_CENTRES } from './components/bits';

/** Add or edit an address (FR-C7). The pin is placed on a map (drag), from the phone's location, or defaults to the city centre. */
export function AddressFormScreen({
  route,
  navigation,
}: CustomerScreen<'AddressForm'>) {
  const id = route.params?.id;
  const t = useT('customerB.addressForm');
  const q = useQuery(
    [...keys.addresses, 'detail', id],
    () => addressesApi.get(id!),
    { enabled: !!id, refetchOnFocus: false },
  );
  if (!id)
    return <AddressForm address={null} onDone={() => navigation.goBack()} />;
  if (q.data)
    return (
      <AddressForm
        key={q.data.updatedAt}
        address={q.data}
        onDone={() => navigation.goBack()}
      />
    );
  return (
    <Screen title={t('editTitle')} back>
      {q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <Skeleton height={320} />
      )}
    </Screen>
  );
}

function AddressForm({
  address,
  onDone,
}: {
  address: Address | null;
  onDone: () => void;
}) {
  const t = useT('customerB.addressForm');
  const tc = useT('common.actions');
  const tmap = useT('mobile.map');
  const [label, setLabel] = useState(address?.label ?? '');
  const [line, setLine] = useState(address?.addressLine ?? '');
  const [city, setCity] = useState<string | null>(
    address?.city ?? (CITIES.length === 1 ? CITIES[0] : null),
  );
  // Device location wins; else an existing address keeps its pin; else the city centre.
  const [device, setDevice] = useState<{ lat: string; lng: string; by: 'gps' | 'map' } | null>(null);
  const [locating, setLocating] = useState(false);
  const toast = useToast();
  const deviceError = useDeviceErrorText();
  const locate = async () => {
    setLocating(true);
    try {
      const p = await getDeviceLocation();
      setDevice({ lat: coord(p.lat), lng: coord(p.lng), by: 'gps' });
    } catch (e) {
      toast.error(deviceError(e));
    } finally {
      setLocating(false);
    }
  };
  const pin = device
    ? { lat: device.lat, lng: device.lng, precise: true }
    : address && address.city === city
      ? { lat: address.latitude, lng: address.longitude, precise: true }
      : city && CITY_CENTRES[city]
      ? { ...CITY_CENTRES[city], precise: false }
      : null;
  // With no city yet the map still opens somewhere sensible (the pilot city).
  const mapCentre = pin ?? CITY_CENTRES[CITIES[0]];
  const valid = line.trim().length >= 3 && !!city && !!pin;

  const save = useAction(
    () => {
      const dto = {
        label: label.trim() || undefined,
        addressLine: line.trim(),
        city: city!,
        latitude: pin!.lat,
        longitude: pin!.lng,
      };
      return address
        ? addressesApi.update(address.id, dto)
        : addressesApi.create(dto);
    },
    {
      invalidate: [keys.addresses],
      success: address ? t('updated') : t('saved'),
      onSuccess: onDone,
    },
  );

  return (
    <Screen
      title={address ? t('editTitle') : t('addTitle')}
      back
      footer={
        <Button
          label={address ? tc('save') : t('saveSubmit')}
          size="lg"
          block
          disabled={!valid}
          loading={save.isPending}
          onPress={() => save.run(undefined)}
        />
      }
    >
      <Text color={colors.textMuted}>{t('description')}</Text>
      <Card style={styles.card}>
        <TextField
          label={t('label')}
          hint={t('labelHint')}
          value={label}
          onChangeText={setLabel}
          maxLength={60}
          placeholder={t('labelPlaceholder')}
          optional
        />
        <Select
          label={t('city')}
          value={city}
          onChange={setCity}
          options={CITIES.map(c => ({ value: c, label: c }))}
          placeholder={t('cityPlaceholder')}
        />
        <TextField
          label={t('address')}
          hint={t('addressHint')}
          value={line}
          onChangeText={setLine}
          maxLength={240}
          placeholder={t('addressPlaceholder')}
        />
      </Card>

      <Card style={styles.gap}>
        <Text variant="small" weight="semibold" color={ink[700]}>
          {t('mapPin')}
        </Text>
        <MapPicker
          lat={Number(mapCentre.lat)}
          lng={Number(mapCentre.lng)}
          onChange={(la, ln) => setDevice({ lat: coord(la), lng: coord(ln), by: 'map' })}
        />
        <Text variant="caption" color={colors.textMuted}>
          {!pin
            ? t('noPin')
            : device?.by === 'map'
              ? tmap('pinnedByYou')
              : pin.precise
                ? t('pinnedPrecise')
                : t('pinnedCentre', { city: city ?? '' })}
        </Text>
        <Button
          label={t('useLocation')}
          icon={LocateFixed}
          variant="secondary"
          loading={locating}
          onPress={locate}
        />
      </Card>
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  gap: { gap: space.sm },
  card: { gap: space.lg },
  ltr: { writingDirection: 'ltr' },
}));
