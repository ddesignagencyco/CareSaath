"use client";

import clsx from "clsx";
import { ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./misc";

export interface ProfileMenuItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function ProfileMenu({
  name,
  phone,
  role,
  items = [],
  onSignOut,
  renderAvatar,
}: {
  name: string;
  phone: string;
  role: string;
  items?: ProfileMenuItem[];
  onSignOut: () => void;
  /** Optional custom avatar (e.g. a profile photo); defaults to initials. */
  renderAvatar?: (size: "sm" | "md") => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("common.actions");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm font-semibold transition-colors";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={clsx(
          "flex items-center gap-2.5 rounded-xl py-1 pe-2 ps-1 transition-colors hover:bg-ink-50",
          open && "bg-ink-50",
        )}
      >
        {renderAvatar ? renderAvatar("sm") : <Avatar name={name} size="sm" />}
        <span className="hidden text-start leading-tight sm:block">
          <span className="block text-sm font-semibold text-ink-900">{name}</span>
          <span className="block text-xs text-ink-500">{role}</span>
        </span>
        <ChevronDown className={clsx("size-4 text-ink-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 z-40 mt-2 w-64 origin-top-right rounded-2xl border border-ink-100 bg-white p-1.5 shadow-pop"
        >
          <div className="flex items-center gap-3 px-3 py-3">
            {renderAvatar ? renderAvatar("md") : <Avatar name={name} />}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink-900">{name}</p>
              <p className="tabular truncate text-xs text-ink-500">{phone}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-ink-100" />
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)} className={clsx(item, "text-ink-700 hover:bg-ink-50")}>
              <Icon className="size-4 text-ink-400" /> {label}
            </Link>
          ))}
          {items.length > 0 && <div className="my-1 h-px bg-ink-100" />}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className={clsx(item, "text-danger-600 hover:bg-danger-50")}
          >
            <LogOut className="size-4" /> {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
