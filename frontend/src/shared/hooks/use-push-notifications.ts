"use client";

import { useEffect } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type SubscribePayload = { endpoint: string; keys: { p256dh: string; auth: string } };

function toPayload(sub: PushSubscription): SubscribePayload | null {
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return null;
  return { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } };
}

/**
 * Registers the push service worker (/sw.js) and subscribes this browser for Web
 * Push, then hands the subscription to the backend so it can deliver alerts while
 * the app is closed. Best-effort and fully guarded: runs only when `enabled`, the
 * browser supports push, notification permission is already granted, and the
 * server has VAPID keys (publicKey → enabled). Never throws. First-time users
 * who grant permission this session subscribe on their next load.
 */
export function usePushNotifications(
  publicKey: () => Promise<{ enabled: boolean; vapidPublicKey: string | null }>,
  subscribe: (sub: SubscribePayload) => Promise<unknown>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          const payload = toPayload(existing);
          if (payload && !cancelled) await subscribe(payload).catch(() => undefined);
          return;
        }
        const cfg = await publicKey();
        if (cancelled || !cfg.enabled || !cfg.vapidPublicKey) return;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey) as BufferSource,
        });
        const payload = toPayload(sub);
        if (payload && !cancelled) await subscribe(payload);
      } catch {
        // best-effort — push just stays off
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, publicKey, subscribe]);
}
