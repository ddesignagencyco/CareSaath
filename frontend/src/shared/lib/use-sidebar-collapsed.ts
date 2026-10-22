"use client";

import { useSyncExternalStore } from "react";

const EVENT = "caresaath:sidebar";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * Desktop sidebar collapsed preference, remembered per section (`key`).
 * The server snapshot is "expanded" so hydration always matches.
 */
export function useSidebarCollapsed(key: string): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, () => read(key), () => false);
  const toggle = () => {
    try {
      localStorage.setItem(key, collapsed ? "0" : "1");
    } catch {
      // storage unavailable; the toggle won't persist
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [collapsed, toggle];
}
