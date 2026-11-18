"use client";

import { useTranslations } from "next-intl";
import { Modal } from "./overlay";

/**
 * Full-size, in-app view of a profile photo. Reuses Modal for the portal,
 * Escape handling and focus trap. The signed URL stays only in the image src —
 * there is deliberately no link, download or "open in new tab" control.
 */
export function PhotoViewer({
  src,
  name,
  onClose,
}: {
  src: string;
  name: string;
  onClose: () => void;
}) {
  const t = useTranslations("common.photo");

  return (
    <Modal open onClose={onClose} size="lg" title={t("manageTitle")}>
      <div className="flex min-h-64 items-center justify-center rounded-xl bg-ink-100/70 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not an optimisable static asset */}
        <img
          src={src}
          alt={name}
          draggable={false}
          className="max-h-[min(72dvh,720px)] max-w-full rounded-lg object-contain shadow-pop"
        />
      </div>
    </Modal>
  );
}
