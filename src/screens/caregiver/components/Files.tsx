import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { UploadFile } from '../../../api/http';
import { FilePickerSheet as SharedPicker } from '../../../components/FilePickerSheet';
import { FileImage, FileText, Lock } from '../../../components/icons';
import { Sheet } from '../../../components/overlay';
import { Text } from '../../../components/Text';
import { Button, IconTile, Touchable } from '../../../components/ui';
import { useT } from '../../../i18n';
import { useApiErrorText } from '../../../lib/query';
import { brand, colors, feedback, ink, radius, space, themed } from '../../../theme';

/**
 * Confidential document viewer (prescriptions, licenses). Images use <Image>;
 * anything else (PDF) opens in the system viewer.
 */
export function FileViewer({ visible, title, load, onClose }: { visible: boolean; title: string; load: () => Promise<{ url: string }>; onClose: () => void }) {
  const ts = useT('shared.fileViewer');
  const apiError = useApiErrorText();
  const { width } = useWindowDimensions();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setUrl(null);
    setError(null);
    load().then(
      r => alive && setUrl(r.url),
      e => alive && setError(apiError(e)),
    );
    return () => {
      alive = false;
    };
    // Load once per open; `load` is an inline closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const w = width - space.lg * 2;
  const isPdf = !!url && /\.pdf($|\?)/i.test(url);

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.confidential}>
        <Lock size={14} color={ink[500]} />
        <Text variant="caption" color={ink[500]} style={styles.flex}>
          {ts('confidential')}
        </Text>
      </View>
      {error ? (
        <Text color={feedback.danger700}>{error}</Text>
      ) : !url ? (
        <ActivityIndicator color={brand[600]} style={styles.loading} />
      ) : isPdf ? (
        <Button label={title} icon={FileText} variant="secondary" onPress={() => Linking.openURL(url).catch(() => undefined)} />
      ) : (
        <Image source={{ uri: url }} style={[styles.page, { width: w, height: w * 1.3 }]} resizeMode="contain" accessibilityLabel={title} />
      )}
    </Sheet>
  );
}

/** One document / prescription in a list. */
export function FileRow({ title, meta, image, onPress }: { title: string; meta: string; image?: boolean; onPress: () => void }) {
  const tc = useT('common.actions');
  const Icon = image ? FileImage : FileText;
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${tc('view')} ${title}`} style={styles.fileRow}>
      <IconTile icon={Icon} tone={image ? 'marigold' : 'teal'} size={40} />
      <View style={styles.flex}>
        <Text weight="semibold" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text variant="small" weight="bold" color={brand[700]} numberOfLines={1}>
        {tc('view')}
      </Text>
    </Touchable>
  );
}

/** Camera, gallery or PDF picker; `photosOnly` for the profile photo. */
export function FilePickerSheet({ visible, onClose, onPick, photosOnly, title }: { visible: boolean; onClose: () => void; onPick: (f: UploadFile) => void; photosOnly?: boolean; title?: string }) {
  return <SharedPicker visible={visible} title={title} onClose={onClose} onPick={onPick} photosOnly={photosOnly} />;
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  confidential: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loading: { paddingVertical: space.xxxl },
  page: { alignSelf: 'center', borderRadius: radius.md, overflow: 'hidden', backgroundColor: ink[50] },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: ink[100], minHeight: 60, overflow: 'hidden' },
  fileIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: brand[50], alignItems: 'center', justifyContent: 'center' },
}));
