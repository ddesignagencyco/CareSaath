import React from 'react';
import type { UploadFile } from '../../../api/http';
import { FilePickerSheet } from '../../../components/FilePickerSheet';

export { ACCEPTED_TYPES, MAX_BYTES } from '../../../lib/files';

/** Demo-mode sample prescription (only offered when USE_MOCKS is on). */
export const SAMPLE_RX: UploadFile = { uri: 'mock://rx.pdf', name: 'prescription.pdf', type: 'application/pdf', size: 120000 };

/** "Attach a prescription" sheet: camera, gallery or a PDF (FR-C5). */
export function AttachSheet({ visible, title, onClose, onPick }: { visible: boolean; title: string; onClose: () => void; onPick: (f: UploadFile) => void }) {
  return <FilePickerSheet visible={visible} title={title} onClose={onClose} onPick={onPick} sample={SAMPLE_RX} />;
}
