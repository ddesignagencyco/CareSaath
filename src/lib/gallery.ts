import { PermissionsAndroid, Platform } from 'react-native';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';

export class GalleryError extends Error {
  constructor(public readonly code: 'permission' | 'failed') {
    super(code);
  }
}

/** Android 9 and older need storage permission to add to the gallery; 10+ (MediaStore) don't. */
async function ensurePermission() {
  if (Platform.OS !== 'android' || Number(Platform.Version) >= 29) return;
  const perm = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
  if (await PermissionsAndroid.check(perm)) return;
  if ((await PermissionsAndroid.request(perm)) !== PermissionsAndroid.RESULTS.GRANTED) throw new GalleryError('permission');
}

/**
 * Saves a chat photo or video to the phone's gallery, in a "Care Sath" album.
 *
 * TODO(backend): works for the device files the mock chat uses. Once chat
 * media come from the server as https URLs, download to a cache file first
 * (Android's saveToCameraRoll copies local files only).
 */
export async function saveToGallery(uri: string, kind: 'image' | 'video'): Promise<void> {
  await ensurePermission();
  try {
    await CameraRoll.saveAsset(uri, { type: kind === 'video' ? 'video' : 'photo', album: 'Care Sath' });
  } catch {
    throw new GalleryError('failed');
  }
}
