import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { profileApi } from '../../../api/caregiver/api';
import { keys } from '../../../api/caregiver/keys';
import type { UploadFile } from '../../../api/http';
import type { CaregiverDocument, DocType } from '../../../api/types';
import { Select } from '../../../components/form';
import { Upload } from '../../../components/icons';
import { RichText, Text } from '../../../components/Text';
import { Button, Touchable } from '../../../components/ui';
import { useT } from '../../../i18n';
import { formatBytes, useFmt, useLabels } from '../../../i18n/format';
import { useAction } from '../../../lib/query';
import { brand, colors, feedback, ink, radius, space, themed } from '../../../theme';
import { FilePickerSheet, FileRow, FileViewer } from './Files';
import { DOC_TYPES } from './helpers';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;

/** Pick a type, attach a file, upload (POST /caregiver/documents). */
export function DocumentUploader({ defaultType = 'LICENSE' }: { defaultType?: DocType }) {
  const t = useT('caregiverB.documents');
  const L = useLabels();
  const [type, setType] = useState<DocType>(defaultType);
  const [file, setFile] = useState<UploadFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const upload = useAction(() => profileApi.uploadDocument(file!, type), {
    invalidate: [keys.profile],
    success: t('uploaded', { doc: L.docType(type) }),
    onSuccess: () => setFile(null),
  });

  function pick(f: UploadFile) {
    const problem = !ALLOWED.includes(f.type) ? t('fileType') : f.size > MAX_BYTES ? t('fileSize') : null;
    setError(problem);
    setFile(problem ? null : f);
  }

  return (
    <View style={styles.gap}>
      <Select<DocType> label={t('docType')} value={type} onChange={setType} options={DOC_TYPES.map(v => ({ value: v, label: L.docType(v) }))} />
      <Touchable onPress={() => setPicking(true)} accessibilityRole="button" style={styles.drop}>
        <Upload size={26} color={brand[600]} />
        {file ? (
          <Text weight="semibold" align="center" numberOfLines={1} ellipsizeMode="middle">
            {`${file.name} · ${formatBytes(file.size)}`}
          </Text>
        ) : (
          <RichText color={ink[600]} boldColor={brand[700]} align="center">
            {t.raw('choose')}
          </RichText>
        )}
        <Text variant="caption" color={ink[400]} align="center">
          {t('formats')}
        </Text>
      </Touchable>
      {!!error && (
        <Text variant="small" color={feedback.danger700}>
          {error}
        </Text>
      )}
      <Button label={t('uploadButton', { type })} disabled={!file} loading={upload.isPending} onPress={() => upload.run(undefined)} block />
      <FilePickerSheet visible={picking} onClose={() => setPicking(false)} onPick={pick} sample={{ uri: `mock://${type.toLowerCase()}.pdf`, name: `${type.toLowerCase()}.pdf`, type: 'application/pdf', size: 150_000 }} />
    </View>
  );
}

export function DocumentList({ documents }: { documents: CaregiverDocument[] }) {
  const t = useT('caregiverB.documents');
  const f = useFmt();
  const L = useLabels();
  const [open, setOpen] = useState<CaregiverDocument | null>(null);
  if (documents.length === 0) {
    return (
      <Text variant="small" color={colors.textMuted}>
        {t('empty')}
      </Text>
    );
  }
  return (
    <View style={styles.list}>
      {documents.map(doc => (
        <FileRow
          key={doc.id}
          title={L.docType(doc.type)}
          image={doc.mimeType.startsWith('image/')}
          meta={`${(doc.mimeType.split('/')[1] ?? '').toUpperCase()} · ${formatBytes(doc.sizeBytes)} · ${f.date(doc.createdAt)}`}
          onPress={() => setOpen(doc)}
        />
      ))}
      <FileViewer visible={!!open} title={open ? L.docType(open.type) : ''} load={() => profileApi.documentUrl(open!.id)} onClose={() => setOpen(null)} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  gap: { gap: space.md },
  list: { gap: space.sm },
  drop: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: ink[200],
    overflow: 'hidden',
  },
}));
