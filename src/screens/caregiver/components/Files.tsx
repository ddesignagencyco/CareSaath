import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { UploadFile } from '../../../api/http';
import { FilePickerSheet as SharedPicker } from '../../../components/FilePickerSheet';
import { FileImage, FileText, Lock } from '../../../components/icons';
import { Sheet } from '../../../components/overlay';
import { Text } from '../../../components/Text';
import { Avatar, Button, IconTile, Touchable } from '../../../components/ui';
import { useT } from '../../../i18n';
import { useApiErrorText } from '../../../lib/query';
import { brand, colors, feedback, ink, radius, space, themed } from '../../../theme';

const SVG_PREFIX = 'data:image/svg+xml';

/** data:image/svg+xml;charset=utf-8,<encoded> -> raw SVG markup. */
export function svgFromDataUrl(url: string): string | null {
  if (!url.startsWith(SVG_PREFIX)) return null;
  const comma = url.indexOf(',');
  try {
    return decodeURIComponent(url.slice(comma + 1));
  } catch {
    return null;
  }
}

/**
 * Confidential document viewer (prescriptions, licenses). The mock serves SVG
 * data URLs, which RN's <Image> can't draw, so those go through SvgXml; real
 * images use <Image>; anything else (PDF) opens in the system viewer.
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

  const svg = url ? svgFromDataUrl(url) : null;
  const w = width - space.lg * 2;
  const isPdf = !!url && !svg && /\.pdf($|\?)/i.test(url);

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
      ) : svg ? (
        <View style={styles.page}>
          <SvgXml xml={svg} width={w} height={w * 1.3} />
        </View>
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

export const SAMPLE_PDF: UploadFile = { uri: 'mock://license.pdf', name: 'license.pdf', type: 'application/pdf', size: 150_000 };
export const SAMPLE_PHOTO: UploadFile = { uri: 'mock://photo.jpg', name: 'photo.jpg', type: 'image/jpeg', size: 220_000 };

/** Camera, gallery or PDF picker; photos only when the sample is an image (profile photo). */
export function FilePickerSheet({ visible, onClose, onPick, sample = SAMPLE_PDF, title }: { visible: boolean; onClose: () => void; onPick: (f: UploadFile) => void; sample?: UploadFile; title?: string }) {
  return <SharedPicker visible={visible} title={title} onClose={onClose} onPick={onPick} sample={sample} photosOnly={sample.type.startsWith('image/')} />;
}

/** Avatar that can also draw the mock's SVG photo URLs. */
export function PhotoAvatar({ name, url, size = 72 }: { name: string; url?: string | null; size?: number }) {
  const svg = url ? svgFromDataUrl(url) : null;
  if (svg) {
    return (
      <View style={[styles.round, { width: size, height: size, borderRadius: size / 2 }]}>
        <SvgXml xml={svg} width={size} height={size} />
      </View>
    );
  }
  return <Avatar name={name} uri={url} size={size} />;
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  round: { overflow: 'hidden' },
  confidential: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loading: { paddingVertical: space.xxxl },
  page: { alignSelf: 'center', borderRadius: radius.md, overflow: 'hidden', backgroundColor: ink[50] },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: ink[100], minHeight: 60, overflow: 'hidden' },
  fileIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: brand[50], alignItems: 'center', justifyContent: 'center' },
}));
