import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CaregiverBadge } from '../api/types';
import { useLabels } from '../i18n/format';
import { radius, space } from '../theme';
import { Award } from './icons';
import { Text } from './Text';

/** Per-tier chip colours, mirroring the web TierBadge. */
const TIER: Record<CaregiverBadge, { bg: string; fg: string; border: string }> = {
  BRONZE: { bg: '#f4e3d3', fg: '#8a5a2f', border: '#e6cbb0' },
  SILVER: { bg: '#e9edf1', fg: '#58687a', border: '#d4dbe2' },
  GOLD: { bg: '#fbeec2', fg: '#8a6a12', border: '#f0dc94' },
  PLATINUM: { bg: '#e6f3f1', fg: '#0f766e', border: '#c7e5e0' },
};

/** Caregiver ranking tier chip (Bronze…Platinum), shown to families and to the caregiver. */
export function TierBadge({ badge }: { badge: CaregiverBadge }) {
  const L = useLabels();
  const c = TIER[badge];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Award size={13} color={c.fg} />
      <Text variant="caption" weight="bold" color={c.fg}>
        {L.caregiverBadge(badge)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
