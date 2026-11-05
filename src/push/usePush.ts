import { useEffect } from 'react';
import { getMessaging, onMessage, onTokenRefresh } from '@react-native-firebase/messaging';
import { getFcmToken, requestPushPermission } from './messaging';
import { registerPushDevice } from './registration';
import { useToast } from '../components/overlay';
import type { AppRole } from '../auth/AuthContext';

/**
 * Wires FCM for the signed-in role: asks permission, registers the device's
 * token with the backend (and again whenever FCM rotates it), and shows
 * foreground messages as a toast.
 *
 * Background / quit-state notifications with a `notification` payload are shown
 * by the OS automatically on the "caresaath-default" channel (created in
 * MainApplication.kt; see also index.js and firebase.json). Signed out, nothing
 * is registered; sign-out removes the token (see AuthContext.signOut).
 */
export function usePushNotifications(role: AppRole | null): void {
  const toast = useToast();

  useEffect(() => {
    if (!role) return;
    let active = true;
    const unsubs: Array<() => void> = [];
    (async () => {
      const granted = await requestPushPermission();
      if (!granted || !active) return;

      const token = await getFcmToken();
      if (!active) return;
      if (token) {
        if (__DEV__) console.log('[FCM-TOKEN]', token);
        await registerPushDevice(role, token).catch(() => undefined);
      }

      const m = getMessaging();
      unsubs.push(
        onTokenRefresh(m, next => {
          registerPushDevice(role, next).catch(() => undefined);
        }),
      );
      unsubs.push(
        onMessage(m, async msg => {
          // Foreground: Android shows no banner on its own. The realtime socket
          // already refreshes the in-app feed, so a toast is enough to surface it.
          const title = msg.notification?.title;
          const body = msg.notification?.body;
          if (title || body) toast.info(body ? `${title ?? ''}${title ? ' — ' : ''}${body}` : String(title));
        }),
      );
    })();

    return () => {
      active = false;
      unsubs.forEach(u => u());
    };
  }, [role, toast]);
}
