import { Linking, PermissionsAndroid, Platform } from 'react-native';
import Geolocation, { type GeolocationResponse } from '@react-native-community/geolocation';

export type LocationError = 'denied' | 'timeout' | 'unavailable';

export class DeviceLocationError extends Error {
  constructor(public readonly code: LocationError) {
    super(code);
  }
}

// 'auto' = Google Play Services' fused provider when present (GPS + Wi-Fi +
// cell), else Android's own LocationManager.
Geolocation.setRNConfiguration({ skipPermissionRequests: false, authorizationLevel: 'whenInUse', locationProvider: 'auto' });

async function ensurePermission(): Promise<void> {
  if (Platform.OS !== 'android') return; // iOS asks on first use (NSLocationWhenInUseUsageDescription).
  const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
  if ((await PermissionsAndroid.check(fine)) || (await PermissionsAndroid.check(coarse))) return;
  // Android 12+ lets the user grant only "approximate"; that is still enough here.
  const res = await PermissionsAndroid.requestMultiple([fine, coarse]);
  if (res[fine] === PermissionsAndroid.RESULTS.GRANTED || res[coarse] === PermissionsAndroid.RESULTS.GRANTED) return;
  // "Don't ask again": Android won't show the prompt any more, so take them to the app's settings.
  if (res[fine] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) Linking.openSettings().catch(() => undefined);
  throw new DeviceLocationError('denied');
}

const toError = (e: { code: number }) => new DeviceLocationError(e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable');

function position(opts: { enableHighAccuracy: boolean; timeout: number; maximumAge: number }): Promise<GeolocationResponse> {
  return new Promise((resolve, reject) => Geolocation.getCurrentPosition(resolve, e => reject(toError(e)), opts));
}

/**
 * The phone's current position, for address pins, GPS check-in/out (FR-CG7)
 * and SOS.
 *
 * A GPS-only fix often never arrives indoors, which is where most visits
 * happen, so: first a precise fix (10 s, a fix up to 30 s old is fine), then
 * the network/Wi-Fi position (accurate to tens of metres, well inside the
 * 300 m check-in radius) before giving up. Permission refusals fail at once.
 */
export async function getDeviceLocation(): Promise<{ lat: number; lng: number; accuracy: number }> {
  await ensurePermission();
  let p: GeolocationResponse;
  try {
    p = await position({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 });
  } catch (e) {
    if (e instanceof DeviceLocationError && e.code === 'denied') throw e;
    try {
      p = await position({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 120_000 });
    } catch (e2) {
      // No provider at all means Location is switched off: open the switch.
      if (e2 instanceof DeviceLocationError && e2.code === 'unavailable') openLocationSettings();
      throw e2;
    }
  }
  return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
}

/** Opens the phone's Location settings (to switch location on). */
export function openLocationSettings() {
  if (Platform.OS === 'android') Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings());
  else Linking.openSettings();
}

/** Decimal string with 6 places, the shape the API stores (Decimal(10,8)). */
export const coord = (n: number) => n.toFixed(6);
