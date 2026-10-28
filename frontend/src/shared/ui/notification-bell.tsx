"use client";

import { useQuery, type QueryKey } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFmt } from "@shared/i18n/use-fmt";
import type { AppNotification } from "@shared/caregiver-types";

/** Describe() output; matches the per-section NotificationView shape structurally. */
export interface NotificationView {
  title: string;
  body: string;
  href: string | null;
  tone: "brand" | "accent" | "danger" | "success" | "neutral";
}

const DOT: Record<NotificationView["tone"], string> = {
  brand: "bg-brand-500",
  accent: "bg-accent-500",
  danger: "bg-danger-600",
  success: "bg-success-600",
  neutral: "bg-ink-300",
};

interface Labels {
  /** Dropdown heading + "view all" footer. */
  title: string;
  empty: string;
  viewAll: string;
  /** aria-label for the bell button. */
  idle: string;
  withCount: (n: number) => string;
}

/**
 * Header bell with a dropdown of the latest in-app (PUSH) notifications.
 * Section-agnostic: the caller supplies its own query, describe() and the
 * per-device "seen" helpers (the backend has no read state — item 17). It
 * queries on the same key the shell uses, so React Query shares one fetch.
 */
export function NotificationBell({
  queryKey,
  queryFn,
  describe,
  seenEvent,
  getSeenAt,
  markSeen,
  markRead,
  allHref,
  labels,
}: {
  queryKey: QueryKey;
  queryFn: () => Promise<{ items: AppNotification[] }>;
  describe: (n: AppNotification) => NotificationView;
  seenEvent: string;
  getSeenAt: () => string;
  markSeen: (iso: string) => void;
  /** Persist read state to the server (everything created at or before `before`). */
  markRead?: (before: string) => void;
  allHref: string;
  labels: Labels;
}) {
  const f = useFmt();
  const [open, setOpen] = useState(false);
  // "seen" snapshot taken when the dropdown opens, so rows stay highlighted while it's open.
  const [seenBefore, setSeenBefore] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const subscribe = useCallback(
    (cb: () => void) => {
      window.addEventListener(seenEvent, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(seenEvent, cb);
        window.removeEventListener("storage", cb);
      };
    },
    [seenEvent],
  );
  const seenAt = useSyncExternalStore(subscribe, getSeenAt, () => "");

  const list = useQuery({ queryKey, queryFn, refetchInterval: 60_000, staleTime: 30_000 });
  const items = (list.data?.items ?? []).filter((n) => n.channel === "PUSH");
  // Unread = not read on the server (cross-device) and not yet seen on this device (instant).
  const unread = items.filter((n) => !n.readAt && n.createdAt > seenAt).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    // `toggle` only runs from the button's onClick (an event handler, not render),
    // so `open` is current here. Keep the side effects OUT of the setState updater:
    // an updater runs during render, and markSeen/markRead there would set state in
    // other components mid-render (React warns about that).
    const next = !open;
    setOpen(next);
    if (!next) return;
    setSeenBefore(getSeenAt());
    if (items[0]) {
      markSeen(items[0].createdAt); // clears the badge on this device instantly
      markRead?.(items[0].createdAt); // persists read state to the server
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread ? labels.withCount(unread) : labels.idle}
        className="relative inline-flex size-10 items-center justify-center rounded-xl text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="tabular absolute -top-0.5 -end-0.5 min-w-[18px] rounded-full bg-danger-600 px-1 text-center text-[10px] leading-[18px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-bold text-ink-900">{labels.title}</p>
            {unread > 0 && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{unread > 9 ? "9+" : unread}</span>
            )}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {!list.data && list.isLoading ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <span className="mt-1 size-2.5 shrink-0 rounded-full bg-ink-100" />
                    <span className="h-3 flex-1 rounded bg-ink-100" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell className="size-6 text-ink-300" />
                <p className="text-sm text-ink-500">{labels.empty}</p>
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {items.slice(0, 8).map((n) => {
                  const v = describe(n);
                  const isNew = n.createdAt > seenBefore;
                  const inner = (
                    <>
                      <span className={clsx("mt-1.5 size-2.5 shrink-0 rounded-full", DOT[v.tone], !isNew && "opacity-40")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className={clsx("text-sm", isNew ? "font-bold text-ink-900" : "font-semibold text-ink-700")}>{v.title}</span>
                          <span className="shrink-0 text-xs text-ink-400">{f.relativeTime(n.createdAt)}</span>
                        </span>
                        {v.body && <span className="mt-0.5 block text-sm text-ink-500">{v.body}</span>}
                      </span>
                      {v.href && <ChevronRight className="rtl:-scale-x-100 mt-1 size-4 shrink-0 text-ink-300" />}
                    </>
                  );
                  return (
                    <li key={n.id}>
                      {v.href ? (
                        <Link href={v.href} onClick={() => setOpen(false)} className={clsx("flex gap-3 px-4 py-3 hover:bg-ink-25", isNew && "bg-brand-50/40")}>
                          {inner}
                        </Link>
                      ) : (
                        <div className="flex gap-3 px-4 py-3">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link
            href={allHref}
            onClick={() => setOpen(false)}
            className="block border-t border-ink-100 px-4 py-3 text-center text-sm font-semibold text-brand-700 hover:bg-ink-25"
          >
            {labels.viewAll}
          </Link>
        </div>
      )}
    </div>
  );
}
