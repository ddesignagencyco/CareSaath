import { Platform } from 'react-native';
import { http as customerHttp } from '../api/customer/http';
import { http as caregiverHttp } from '../api/caregiver/http';
import type { AppRole } from '../auth/AuthContext';

/**
 * Tells the backend which phone to push to (POST /notifications/devices) and
 * forgets it again on sign-out (POST /notifications/devices/remove). Each role
 * signs in with its own session, so the call goes through that role's client.
 */
let registered: { role: AppRole; token: string } | null = null;

const httpFor = (role: AppRole) => (role === 'customer' ? customerHttp : caregiverHttp);

export async function registerPushDevice(role: AppRole, token: string): Promise<void> {
  if (registered?.role === role && registered.token === token) return;
  await httpFor(role).post('/notifications/devices', {
    token,
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
  });
  registered = { role, token };
}

/**
 * Removes this phone's token while the session still exists (call before the
 * session is cleared). Gives up after `timeoutMs` so a slow network never holds
 * up sign-out; the backend also drops tokens FCM reports as dead.
 */
export async function unregisterPushDevice(timeoutMs = 3000): Promise<void> {
  const current = registered;
  registered = null;
  if (!current) return;
  const remove = httpFor(current.role)
    .post('/notifications/devices/remove', { token: current.token })
    .catch(() => undefined);
  await Promise.race([remove, new Promise<void>(resolve => setTimeout(() => resolve(), timeoutMs))]);
}
