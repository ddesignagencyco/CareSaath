import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { USE_MOCKS } from '../api/config';
import type { UploadFile } from '../api/http';
import { useT } from '../i18n';
import { FilePickError, pickDocument, pickPhoto } from '../lib/files';
import { DeviceLocationError } from '../lib/location';
import { space } from '../theme';
import { Camera, FileText, FileImage, Paperclip } from './icons';
import { Sheet, useToast } from './overlay';
import { ListRow, Divider, Card } from './ui';

/** Translates picker / location failures into the app's words. */
export function useDeviceErrorText() {
  const t = useT('mobile.common');
  return useCallback(
    (e: unknown) => {
      if (e instanceof FilePickError) {
        const map = { cameraUnavailable: 'cameraUnavailable', permission: 'pickPermission', badType: 'fileBadType', tooBig: 'fileTooBig', chatTooBig: 'chatFileTooBig', failed: 'pickFailed' } as const;
        return t(map[e.code]);
      }
      if (e instanceof DeviceLocationError) {
        const map = { denied: 'locDenied', timeout: 'locTimeout', unavailable: 'locUnavailable' } as const;
        return t(map[e.code]);
      }
      return t('pickFailed');
    },
    [t],
  );
}

/**
 * Bottom sheet to attach a file: camera, gallery, and (unless `photosOnly`)
 * a PDF from the files app. In demo mode a sample file is offered too, so
 * the flow can be tried without real documents; it never appears against
 * the real API.
 */
export function FilePickerSheet({
  visible,
  title,
  onClose,
  onPick,
  photosOnly,
  sample,
}: {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onPick: (file: UploadFile) => void;
  photosOnly?: boolean;
  sample?: UploadFile;
}) {
  const t = useT('mobile.common');
  const toast = useToast();
  const errorText = useDeviceErrorText();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<UploadFile | null>) => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await fn();
      if (file) {
        onClose();
        onPick(file);
      }
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title ?? t('attach')}>
      <Card padded={false}>
        <ListRow icon={Camera} title={t('takePhoto')} onPress={() => run(() => pickPhoto('camera'))} />
        <Divider inset={space.lg} />
        <ListRow icon={FileImage} title={t('choosePhoto')} onPress={() => run(() => pickPhoto('library'))} />
        {!photosOnly && (
          <>
            <Divider inset={space.lg} />
            <ListRow icon={FileText} title={t('chooseDocument')} onPress={() => run(pickDocument)} />
          </>
        )}
      </Card>
      {USE_MOCKS && sample && (
        <View style={styles.demo}>
          <ListRow icon={Paperclip} title={t('demoSample')} chevron={false} onPress={() => run(async () => sample)} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  demo: { opacity: 0.85 },
});
