import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { profileApi } from '../../../api/caregiver/api';
import { keys } from '../../../api/caregiver/keys';
import type { CaregiverServiceArea, ServiceAreaInput } from '../../../api/types';
import { Select } from '../../../components/form';
import { Check, MapPin } from '../../../components/icons';
import { SkeletonList } from '../../../components/screen';
import { Text } from '../../../components/Text';
import { Button, Chip } from '../../../components/ui';
import { useT } from '../../../i18n';
import { useAction, useQuery } from '../../../lib/query';
import { brand, ink, radius as themeRadius, space, themed } from '../../../theme';
import { LAHORE_AREAS, SERVICE_RADIUS_OPTIONS } from './helpers';
import { Panel } from './Bits';

/**
 * Sub-city coverage zones (Option A — predefined Lahore areas, no map picker).
 * Each chosen area is sent as { city, label, lat, lng, radiusMeters } to
 * PUT /caregiver/service-areas. An empty selection = "all of Lahore".
 */
export function ServiceAreasCard() {
  const t = useT('caregiverA.serviceAreas');
  const areas = useQuery(keys.serviceAreas, profileApi.serviceAreas);
  return (
    <Panel icon={MapPin} tone="mint" title={t('title')} description={t('description')}>
      {!areas.data ? <SkeletonList count={2} height={40} /> : <ServiceAreasForm key={areas.data.map(a => `${a.label}:${a.radiusMeters}`).join('|')} initial={areas.data} />}
    </Panel>
  );
}

function ServiceAreasForm({ initial }: { initial: CaregiverServiceArea[] }) {
  const t = useT('caregiverA.serviceAreas');
  const saved = initial.map(a => a.label).filter((l): l is string => !!l && LAHORE_AREAS.some(o => o.value === l));
  const [selected, setSelected] = useState<string[]>(saved);
  const [radius, setRadius] = useState(String(initial[0]?.radiusMeters ?? 5000));

  const save = useAction(
    () => {
      const payload: ServiceAreaInput[] = selected.map(v => {
        const a = LAHORE_AREAS.find(x => x.value === v)!;
        return { city: 'Lahore', label: a.label, lat: a.lat, lng: a.lng, radiusMeters: Number(radius) };
      });
      return profileApi.setServiceAreas(payload);
    },
    { invalidate: [keys.serviceAreas], success: t('saved') },
  );

  const toggle = (v: string) => setSelected(s => (s.includes(v) ? s.filter(x => x !== v) : [...s, v]));
  const radiusLabel = SERVICE_RADIUS_OPTIONS.find(o => o.value === radius)?.label ?? radius;

  return (
    <View style={styles.form}>
      <Text variant="small" weight="semibold" color={ink[700]}>
        {t('areasLabel')}
      </Text>
      <Text variant="caption" color={ink[500]}>
        {t('areasHint')}
      </Text>
      <View style={styles.chips}>
        {LAHORE_AREAS.map(a => (
          <Chip key={a.value} label={a.label} selected={selected.includes(a.value)} icon={selected.includes(a.value) ? Check : undefined} onPress={() => toggle(a.value)} />
        ))}
      </View>

      {selected.length > 0 && (
        <Select<string>
          label={t('radiusLabel')}
          hint={t('radiusHint')}
          value={radius}
          onChange={v => v && setRadius(v)}
          options={SERVICE_RADIUS_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
        />
      )}

      <View style={styles.summary}>
        <MapPin size={16} color={brand[600]} />
        <Text variant="small" color={brand[800]} style={styles.flex}>
          {selected.length > 0 ? t('summary', { radius: radiusLabel, areas: selected.join(', ') }) : t('wholeCity')}
        </Text>
      </View>

      <Button label={t('save')} loading={save.isPending} onPress={() => save.run(undefined)} block />
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    form: { gap: space.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
    summary: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: themeRadius.md, backgroundColor: brand[50], borderWidth: 1, borderColor: brand[100], marginTop: space.xs },
  }),
);
