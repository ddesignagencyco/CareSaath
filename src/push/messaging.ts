import { PermissionsAndroid, Platform } from 'react-native';
import { AuthorizationStatus, getMessaging, getToken, requestPermission } from '@react-native-firebase/messaging';

/**
 * Ask for notification permission: Android 13+ needs the POST_NOTIFICATIONS
 * runtime grant, then FCM's own authorization (also covers iOS/APNs later).
 */
export async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 33) {
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (res !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }
  const status = await requestPermission(getMessaging());
  return status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL;
}

/** The device's current FCM token, or null if it can't be fetched. */
export async function getFcmToken(): Promise<string | null> {
  try {
    return await getToken(getMessaging());
  } catch {
    return null;
  }
}
