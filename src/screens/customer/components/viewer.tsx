import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Lock } from '../../../components/icons';
import { Sheet } from '../../../components/overlay';
import { ErrorState } from '../../../components/screen';
import { Text } from '../../../components/Text';
import { Button } from '../../../components/ui';
import { useT } from '../../../i18n';
import { brand, colors, ink, radius, space, themed } from '../../../theme';

/**
 * View-only document sheet. Images render inline (SVG via react-native-svg,
 * which the mock returns); PDFs open in the system viewer.
 */
export function FileViewerSheet({
  visible,
  title,
  load,
  onClose,
}: {
  visible: boolean;
  title: string;
  load: () => Promise<{ url: string; mimeType: string }>;
  onClose: () => void;
}) {
  const t = useT('shared.fileViewer');
  const tm = useT('mobileCustomer.viewer');
  const { width } = useWindowDimensions();
  const [state, setState] = useState<{ url: string; mimeType: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    setState(null);
    setError(null);
    load().then(
      r => live && setState(r),
      e => live && setError(e),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, attempt]);

  const w = width - space.lg * 2;
  const svg = state?.url.startsWith('data:image/svg+xml') ? decodeURIComponent(state.url.slice(state.url.indexOf(',') + 1)) : null;

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.badge}>
        <Lock size={14} color={brand[700]} />
        <Text variant="caption" weight="semibold" color={brand[700]}>
          {t('confidential')}
        </Text>
      </View>
      {error ? (
        <ErrorState error={error} onRetry={() => setAttempt(a => a + 1)} />
      ) : !state ? (
        <View style={[styles.frame, { height: w * 1.3 }]}>
          <ActivityIndicator color={brand[600]} />
        </View>
      ) : svg ? (
        <View style={styles.frame}>
          <SvgXml xml={svg} width={w} height={w * (1100 / 850)} />
        </View>
      ) : state.mimeType.startsWith('image/') ? (
        <Image source={{ uri: state.url }} style={[styles.frame, { width: w, height: w * 1.3 }]} resizeMode="contain" accessibilityIgnoresInvertColors />
      ) : (
        <Button label={tm('openFile')} variant="secondary" onPress={() => Linking.openURL(state.url).catch(() => {})} />
      )}
    </Sheet>
  );
}

const styles = themed(() => StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  frame: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: ink[100], backgroundColor: colors.surface, overflow: 'hidden' },
}));
