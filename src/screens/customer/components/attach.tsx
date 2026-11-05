import React from 'react';
import type { UploadFile } from '../../../api/http';
import { FilePickerSheet } from '../../../components/FilePickerSheet';

export { ACCEPTED_TYPES, MAX_BYTES } from '../../../lib/files';

/** "Attach a prescription" sheet: camera, gallery or a PDF (FR-C5). */
export function AttachSheet({ visible, title, onClose, onPick }: { visible: boolean; title: string; onClose: () => void; onPick: (f: UploadFile) => void }) {
  return <FilePickerSheet visible={visible} title={title} onClose={onClose} onPick={onPick} />;
}
