"use client";

import { useEffect } from "react";

const PRIMED_KEY = "caresaath.permissions.primed.v1";

/**
 * Ask for the browser permissions the live features need — once per device, on the
 * user's first tap inside the authenticated app. Browsers only allow
 * `Notification.requestPermission()` from a user gesture, so this waits for the
 * first pointer/key interaction instead of firing on mount.
 *
 * - Notifications: so visit and chat alerts can surface while the tab is open.
 *   (True push while the app is closed also needs a service worker + a backend
 *   web-push endpoint — see docs/requirement.md.)
 * - Location (`warmLocation`, caregivers): a one-off read so the GPS prompt is
 *   handled up front rather than in the middle of starting a visit.
 *
 * Everything is feature-detected and best-effort; it never throws and does nothing
 * on the server or in browsers without the APIs.
 */
export function usePermissionPrime({ warmLocation = false }: { warmLocation?: boolean } = {}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(PRIMED_KEY)) return;
    } catch {
      // storage blocked (private mode): fall through and prime without the once-guard
    }

    const run = () => {
      try {
        localStorage.setItem(PRIMED_KEY, "1");
      } catch {
        // ignore
      }
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          void Notification.requestPermission().catch(() => undefined);
        }
      } catch {
        // unsupported
      }
      if (warmLocation && navigator.geolocation) {
        try {
          navigator.geolocation.getCurrentPosition(
            () => undefined,
            () => undefined,
            { enableHighAccuracy: false, maximumAge: 600_000, timeout: 10_000 },
          );
        } catch {
          // ignore
        }
      }
      cleanup();
    };

    const cleanup = () => {
      window.removeEventListener("pointerdown", run);
      window.removeEventListener("keydown", run);
    };
    window.addEventListener("pointerdown", run, { once: true });
    window.addEventListener("keydown", run, { once: true });
    return cleanup;
  }, [warmLocation]);
}
