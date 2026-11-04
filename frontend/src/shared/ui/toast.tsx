"use client";

import clsx from "clsx";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useState } from "react";

export type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tr = useTranslations("common.toast");

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-5 z-[100] flex flex-col items-center gap-2.5 sm:inset-x-auto sm:end-6 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-[0_10px_35px_rgba(0,0,0,0.18)] transition-all animate-in fade-in slide-in-from-bottom-2",
              t.kind === "success"
                ? "border-emerald-500/30 text-ink-900"
                : t.kind === "info"
                  ? "border-brand-500/30 text-ink-900"
                  : "border-rose-500/40 text-ink-900",
            )}
          >
            {t.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : t.kind === "info" ? (
              <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" />
            )}
            <p className="flex-1 font-medium leading-snug">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              aria-label={tr("dismiss")}
              className="text-ink-400 hover:text-ink-700 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  return {
    success: (message: string) => push("success", message),
    error: (message: string) => push("error", message),
    info: (message: string) => push("info", message),
  };
}
