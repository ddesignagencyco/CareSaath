import React, { useEffect } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { availabilityApi, profileApi } from '../../../api/caregiver/api';
import { keys } from '../../../api/caregiver/keys';
import { Siren } from '../../../components/icons';
import { useToast } from '../../../components/overlay';
import { Text } from '../../../components/Text';
import { useT } from '../../../i18n';
import { DeviceLocationError, getDeviceLocation } from '../../../lib/location';
import { useAction, useQuery } from '../../../lib/query';
import { brand, colors, feedback, ink, radius, space, themed } from '../../../theme';
import { Panel } from './Bits';

/**
 * "Available now" — opt in to immediate (ASAP / emergency) visits. While on, the
 * app shares the caregiver's live GPS (PATCH /caregiver/location) so nearby
 * families can find and book them right away; the backend keeps them "live"
 * only as long as a fresh fix keeps arriving.
 */
export function AvailableNowCard() {
  const t = useT('mobileCaregiver.availableNow');
  const toast = useToast();
  const profile = useQuery(keys.profile, profileApi.get);
  const on = profile.data?.acceptingImmediate ?? false;
  const live = profile.data?.availableNow ?? false;

  // Heartbeat: while opted in, push a fix now and every 90s so we stay live.
  useEffect(() => {
    if (!on) return;
    let stopped = false;
    const push = async () => {
      try {
        const { lat, lng } = await getDeviceLocation();
        if (!stopped) await availabilityApi.updateLocation(lat, lng);
      } catch {
        // Best-effort: a missed fix just lets "available now" lapse until the next one.
      }
    };
    void push();
    const iv = setInterval(() => void push(), 90_000);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, [on]);

  const toggle = useAction(
    async (next: boolean) => {
      // Turning on needs a location fix first, otherwise the backend can't mark us live.
      if (next) {
        const { lat, lng } = await getDeviceLocation();
        await availabilityApi.updateLocation(lat, lng);
      }
      return availabilityApi.setAvailableNow(next);
    },
    {
      invalidate: [keys.profile],
      success: null,
      onError: err => {
        if (err instanceof DeviceLocationError) {
          toast.error(t(`loc.${err.code}`));
          return true; // handled — suppress the default (raw) toast
        }
        return false;
      },
    },
  );

  const status = !on ? t('off') : live ? t('live') : t('paused');

  return (
    <Panel title={t('title')} description={t('subtitle')}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: !on ? ink[300] : live ? feedback.success600 : feedback.warning600 }]}>
          <Siren size={18} color="#fff" />
        </View>
        <Text variant="small" weight="semibold" color={!on ? colors.textMuted : live ? feedback.success700 : feedback.warning700} style={styles.flex}>
          {status}
        </Text>
        <Switch
          value={on}
          onValueChange={next => {
            void toggle.run(next);
          }}
          disabled={toggle.isPending || profile.isLoading}
          trackColor={{ true: brand[500], false: ink[300] }}
          thumbColor="#fff"
          accessibilityLabel={t('title')}
        />
      </View>
      <Text variant="small" color={colors.textMuted}>
        {t('note')}
      </Text>
    </Panel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
    dot: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  }),
);
