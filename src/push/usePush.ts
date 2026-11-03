import { useEffect } from 'react';
import { getMessaging, onMessage, onTokenRefresh } from '@react-native-firebase/messaging';
import { getFcmToken, requestPushPermission } from './messaging';

/**
 * Wires FCM on the device: asks permission, fetches the token, and listens for
 * incoming messages.
 *
 * Server registration of the token is intentionally a TODO — the backend
 * device-token endpoint is not built yet. For now the token is logged (dev only)
 * so a push can be sent from the Firebase console ("Cloud Messaging → Send test
 * message") straight to this device to verify receipt, no backend required.
 *
 * Background / quit-state notifications with a `notification` payload are shown
 * by the OS automatically (see the handler registered in index.js); foreground
 * messages arrive via onMessage below.
 */
export function usePushNotifications(): void {
  useEffect(() => {
    let active = true;
    const unsubs: Array<() => void> = [];
    (async () => {
      const granted = await requestPushPermission();
      if (!granted || !active) return;

      const token = await getFcmToken();
      if (token && __DEV__) {
        // Grep logcat for "FCM-TOKEN" to copy this into the Firebase console test sender.
        console.log('[FCM-TOKEN]', token);
      }
      // TODO(backend): POST `token` to the device-token endpoint once it exists,
      // and re-POST on refresh below. Deferred per current scope (no backend changes).

      const m = getMessaging();
      unsubs.push(
        onTokenRefresh(m, next => {
          if (__DEV__) console.log('[FCM-TOKEN:refresh]', next);
        }),
      );
      unsubs.push(
        onMessage(m, async msg => {
          // Foreground: no OS banner by default. Live data is already kept fresh by
          // the realtime socket, so just trace it in dev for now.
          if (__DEV__) console.log('[FCM] foreground message', msg?.messageId ?? '');
        }),
      );
    })();

    return () => {
      active = false;
      unsubs.forEach(u => u());
    };
  }, []);
}
