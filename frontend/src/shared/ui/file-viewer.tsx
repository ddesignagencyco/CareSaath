"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Maximize2, ShieldCheck, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { IconButton } from "./button";
import { ErrorState, Skeleton } from "./misc";
import { Modal } from "./overlay";

const ZOOMS = [1, 1.5, 2, 3];

/**
 * In-app viewer for files behind short-lived signed URLs (licenses, CNIC
 * copies, prescriptions). The URL is fetched when opened, never cached, and
 * never exposed as a link: no "open in new tab" or download controls.
 */
export function FileViewer({
  id,
  title,
  description,
  mimeType,
  load,
  onClose,
}: {
  id: string;
  title: string;
  description?: string;
  /** Known type of the stored file; the URL response may override it. */
  mimeType?: string;
  load: () => Promise<{ url: string; mimeType?: string }>;
  onClose: () => void;
}) {
  const file = useQuery({ queryKey: ["signed-url", id], queryFn: load, gcTime: 0, staleTime: 0 });
  const [zoom, setZoom] = useState(0);
  const t = useTranslations("shared.fileViewer");

  const url = file.data?.url ?? "";
  const type = file.data?.mimeType ?? mimeType ?? "";
  // Decide by what the URL actually serves (mock data URLs are images even for "PDF" records).
  const isImage = url.startsWith("data:image") || type.startsWith("image/");
  const scale = ZOOMS[zoom];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={title}
      description={description}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-ink-500">
            <ShieldCheck className="size-3.5 text-brand-600" /> {t("confidential")}
          </p>
          {isImage && file.data && (
            <div className="flex items-center gap-1" role="group" aria-label={t("zoom")}>
              <IconButton label={t("zoomOut")} onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} className="disabled:opacity-40">
                <ZoomOut className="size-4" />
              </IconButton>
              <span className="tabular w-12 text-center text-xs font-semibold text-ink-600">{Math.round(scale * 100)}%</span>
              <IconButton label={t("zoomIn")} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} className="disabled:opacity-40">
                <ZoomIn className="size-4" />
              </IconButton>
              <IconButton label={t("fit")} onClick={() => setZoom(0)} disabled={zoom === 0} className="disabled:opacity-40">
                <Maximize2 className="size-4" />
              </IconButton>
            </div>
          )}
        </div>
      }
    >
      <div
        className={clsx(
          "relative h-[min(calc(92dvh-200px),760px)] min-h-64 overflow-auto rounded-xl bg-ink-100/70",
          !isImage || zoom === 0 ? "flex items-center justify-center" : "",
        )}
        onContextMenu={(e) => e.preventDefault()}
      >
        {file.isError ? (
          <ErrorState error={file.error} onRetry={() => file.refetch()} />
        ) : !file.data ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL, not optimisable
          <img
            src={url}
            alt={title}
            draggable={false}
            className={clsx("select-none", zoom === 0 ? "max-h-full max-w-full object-contain p-3" : "max-w-none origin-top-left")}
            style={zoom === 0 ? undefined : { width: `${scale * 100}%` }}
          />
        ) : (
          <iframe
            // Hide the PDF viewer's toolbar (download/print) where the browser supports it.
            src={`${url}#toolbar=0&navpanes=0&view=FitH`}
            title={title}
            className="h-full w-full rounded-xl border-0 bg-white"
          />
        )}
      </div>
    </Modal>
  );
}
