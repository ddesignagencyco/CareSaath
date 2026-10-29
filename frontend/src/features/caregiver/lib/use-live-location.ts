"use client";

import { useEffect, useState } from "react";
import { profileApi } from "./api/caregiver";

const PREF_KEY = "caresaath.caregiver.shareLocation";
const PREF_EVENT = "caresaath:location-pref";

/** Live-location sharing is on by default (needed for immediate bookings); the caregiver can opt out. */
export function getLocationSharing(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

function setLocationSharing(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    // ignore (private mode / quota)
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PREF_EVENT));
}

/** Read + toggle the sharing preference; stays in sync across the app via a window event. */
export function useLocationSharing(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client hydrate from localStorage
    setOn(getLocationSharing());
    const sync = () => setOn(getLocationSharing());
    window.addEventListener(PREF_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PREF_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [on, (v: boolean) => setLocationSharing(v)];
}

/**
 * While the caregiver app is open and foregrounded AND they haven't opted out,
 * periodically share their GPS (`PATCH /caregiver/location`) so nearby families
 * can book them for an immediate (ASAP) visit. Best-effort — silent on error.
 */
export function useLiveLocation(enabled: boolean) {
  const [sharing] = useLocationSharing();
  useEffect(() => {
    if (!enabled || !sharing || typeof navigator === "undefined" || !navigator.geolocation) return;
    let stopped = false;
    const push = () => {
      if (document.visibilityState !== "visible") return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!stopped) profileApi.updateLocation(pos.coords.latitude, pos.coords.longitude).catch(() => undefined);
        },
        () => undefined,
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
      );
    };
    push();
    const iv = window.setInterval(push, 90_000);
    return () => {
      stopped = true;
      window.clearInterval(iv);
    };
  }, [enabled, sharing]);
}
