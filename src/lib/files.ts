import { errorCodes, isErrorWithCode, keepLocalCopy, pick, types } from '@react-native-documents/picker';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import type { UploadFile } from '../api/http';

/** Same rules the backend enforces (JPEG/PNG/WEBP/PDF, 10 MB). */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_BYTES = 10 * 1024 * 1024;

export type PickError = 'cameraUnavailable' | 'permission' | 'badType' | 'tooBig' | 'chatTooBig' | 'failed';

export class FilePickError extends Error {
  constructor(public readonly code: PickError) {
    super(code);
  }
}

function check(file: UploadFile): UploadFile {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new FilePickError('badType');
  if (file.size > MAX_BYTES) throw new FilePickError('tooBig');
  return file;
}

function fromAsset(a: Asset | undefined): UploadFile | null {
  if (!a?.uri) return null;
  const type = a.type ?? 'image/jpeg';
  const ext = type.split('/')[1] ?? 'jpg';
  return check({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.${ext}`, type, size: a.fileSize ?? 0 });
}

/**
 * Photo from the camera or gallery. Shrunk on the device (1600 px, 70 %):
 * prescriptions are often phone photos of paper, and uploads go over 3G.
 * Resolves null when the user cancels.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<UploadFile | null> {
  const options = { mediaType: 'photo' as const, maxWidth: 1600, maxHeight: 1600, quality: 0.7 as const, selectionLimit: 1 };
  const res = source === 'camera' ? await launchCamera(options) : await launchImageLibrary(options);
  if (res.didCancel) return null;
  if (res.errorCode === 'camera_unavailable') throw new FilePickError('cameraUnavailable');
  if (res.errorCode === 'permission') throw new FilePickError('permission');
  if (res.errorCode) throw new FilePickError('failed');
  return fromAsset(res.assets?.[0]);
}

/** A PDF or image from the files app. Resolves null when the user cancels. */
export async function pickDocument(): Promise<UploadFile | null> {
  try {
    const [doc] = await pick({ type: [types.pdf, types.images] });
    if (!doc?.uri) return null;
    return check({ uri: doc.uri, name: doc.name ?? `document-${Date.now()}`, type: doc.type ?? 'application/octet-stream', size: doc.size ?? 0 });
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return null;
    if (e instanceof FilePickError) throw e;
    throw new FilePickError('failed');
  }
}

/* ---- Chat media ------------------------------------------------------------ */

/**
 * Chat attachments go up through resumable uploads (lib/uploads), so they can
 * be much larger than form uploads. Photos are still shrunk on the device.
 */
export const CHAT_MAX_BYTES = 200 * 1024 * 1024;

export interface ChatPick extends UploadFile {
  durationMs?: number;
  width?: number;
  height?: number;
}

function chatCheck(file: ChatPick): ChatPick {
  if (file.size > CHAT_MAX_BYTES) throw new FilePickError('chatTooBig');
  return file;
}

function pickerError(res: { errorCode?: string }) {
  if (res.errorCode === 'camera_unavailable') throw new FilePickError('cameraUnavailable');
  if (res.errorCode === 'permission') throw new FilePickError('permission');
  if (res.errorCode) throw new FilePickError('failed');
}

/** Pickers don't always report a size; read it from the file. */
export async function fileSize(uri: string): Promise<number> {
  try {
    return (await (await fetch(uri)).blob()).size;
  } catch {
    return 0;
  }
}

async function withSize(file: ChatPick): Promise<ChatPick> {
  const size = file.size || (await fileSize(file.uri));
  if (!size) throw new FilePickError('failed');
  return { ...file, size };
}

export async function pickChatPhoto(source: 'camera' | 'library'): Promise<ChatPick | null> {
  const options = { mediaType: 'photo' as const, maxWidth: 2048, maxHeight: 2048, quality: 0.8 as const, selectionLimit: 1 };
  const res = source === 'camera' ? await launchCamera(options) : await launchImageLibrary(options);
  if (res.didCancel) return null;
  pickerError(res);
  const a = res.assets?.[0];
  if (!a?.uri) return null;
  const type = a.type ?? 'image/jpeg';
  return chatCheck(await withSize({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.${type.split('/')[1] ?? 'jpg'}`, type, size: a.fileSize ?? 0, width: a.width, height: a.height }));
}

/** Video from the camera (10 min max) or gallery, kept as recorded. */
export async function pickChatVideo(source: 'camera' | 'library'): Promise<ChatPick | null> {
  const options = { mediaType: 'video' as const, videoQuality: 'high' as const, durationLimit: 600, formatAsMp4: true, selectionLimit: 1 };
  const res = source === 'camera' ? await launchCamera(options) : await launchImageLibrary(options);
  if (res.didCancel) return null;
  pickerError(res);
  const a = res.assets?.[0];
  if (!a?.uri) return null;
  return chatCheck(
    await withSize({
      uri: a.uri,
      name: a.fileName ?? `video-${Date.now()}.mp4`,
      type: a.type ?? 'video/mp4',
      size: a.fileSize ?? 0,
      durationMs: a.duration ? Math.round(a.duration * 1000) : undefined,
      width: a.width,
      height: a.height,
    }),
  );
}

/**
 * Any document. Copied into the app's cache: a content:// grant can lapse
 * before a paused upload resumes, the copy cannot.
 */
export async function pickChatDocument(): Promise<ChatPick | null> {
  try {
    const [doc] = await pick({ type: [types.allFiles] });
    if (!doc?.uri) return null;
    const name = doc.name ?? `file-${Date.now()}`;
    const [copy] = await keepLocalCopy({ files: [{ uri: doc.uri, fileName: name }], destination: 'cachesDirectory' });
    const uri = copy.status === 'success' ? copy.localUri : doc.uri;
    return chatCheck(await withSize({ uri, name, type: doc.type ?? 'application/octet-stream', size: doc.size ?? 0 }));
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return null;
    if (e instanceof FilePickError) throw e;
    throw new FilePickError('failed');
  }
}
