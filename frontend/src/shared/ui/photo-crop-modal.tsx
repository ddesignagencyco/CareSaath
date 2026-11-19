"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";
import { useToast } from "./toast";

const VIEWPORT_SIZE = 280; // px on screen
const GUIDE_DIAMETER = 240; // px circular guide diameter (r=120)
const OUTPUT_SIZE = 512; // px square export
const MAX_EXPORT_BYTES = 10 * 1024 * 1024;

interface PhotoCropModalProps {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onCrop: (croppedFile: File) => void;
}

export function PhotoCropModal({ open, file, onClose, onCrop }: PhotoCropModalProps) {
  const t = useTranslations("common.photo");
  const toast = useToast();

  const viewportRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const toastRef = useRef(toast);
  const tRef = useRef(t);
  useEffect(() => {
    onCloseRef.current = onClose;
    toastRef.current = toast;
    tRef.current = t;
  });

  const [prevFile, setPrevFile] = useState<File | null>(null);
  const [loaded, setLoaded] = useState<{ file: File; url: string; width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);

  if (file !== prevFile) {
    setPrevFile(file);
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }

  const imageSrc = loaded && loaded.file === file ? loaded.url : null;
  const naturalSize = loaded && loaded.file === file ? { width: loaded.width, height: loaded.height } : null;

  // Load image file into an object URL
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const url = URL.createObjectURL(file);

    const img = new Image();
    img.onload = () => {
      if (!cancelled) setLoaded({ file, url, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) {
        toastRef.current.error(tRef.current("invalid"));
        onCloseRef.current();
      }
    };
    img.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Attach non-passive wheel listener so zooming prevents background scroll without console errors.
  useEffect(() => {
    const el = viewportRef.current;
    if (!open || !el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * -0.002;
      setZoom((z) => Math.min(3, Math.max(1, Number((z + delta).toFixed(2)))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture release fallback
      }
      setIsDragging(false);
    }
  };

  const rotateCw = () => setRotation((r) => (r + 90) % 360);
  const resetAll = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  // Base dimensions to cover the crop circle
  const isRotated90or270 = rotation % 180 !== 0;
  const effectiveWidth = naturalSize ? (isRotated90or270 ? naturalSize.height : naturalSize.width) : VIEWPORT_SIZE;
  const effectiveHeight = naturalSize ? (isRotated90or270 ? naturalSize.width : naturalSize.height) : VIEWPORT_SIZE;
  const baseScale = Math.max(VIEWPORT_SIZE / (effectiveWidth || 1), VIEWPORT_SIZE / (effectiveHeight || 1));

  const handleApply = async () => {
    if (!imageSrc || !file || !naturalSize) return;
    setProcessing(true);

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = imageSrc;
      });

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");

      // Fill with white in case of transparent PNG/WEBP
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      // Match the 240px circular guide so the exported avatar matches the user's framing 1:1.
      const ratio = OUTPUT_SIZE / GUIDE_DIAMETER;

      // Transform to match viewport center
      ctx.save();
      ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
      ctx.translate(offset.x * ratio, offset.y * ratio);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      // Draw image centered using base scale
      const drawWidth = naturalSize.width * baseScale * ratio;
      const drawHeight = naturalSize.height * baseScale * ratio;
      ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.92);
      });

      if (!blob) throw new Error("Failed to generate image blob");
      if (blob.size > MAX_EXPORT_BYTES) {
        toast.error(t("invalid"));
        setProcessing(false);
        return;
      }

      const croppedFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
      const croppedFile = new File([blob], croppedFileName, { type: "image/jpeg" });

      onCrop(croppedFile);
      onClose();
    } catch {
      toast.error(t("cropFailed"));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !processing && !isOpen && onClose()}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>{t("cropTitle")}</DialogTitle>
          <DialogDescription>{t("cropDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {/* Crop Viewport with Circular Avatar Mask */}
          <div
            ref={viewportRef}
            className="relative size-[280px] overflow-hidden rounded-2xl bg-ink-900 select-none touch-none shadow-inner"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* The transformed image */}
            {imageSrc && naturalSize && (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview for interactive canvas crop
              <img
                src={imageSrc}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none origin-center select-none"
                style={{
                  width: `${naturalSize.width * baseScale}px`,
                  height: `${naturalSize.height * baseScale}px`,
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
                  cursor: isDragging ? "grabbing" : "grab",
                }}
              />
            )}

            {/* Circular cutout vignette / avatar guide */}
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/10">
              <svg className="size-full" viewBox="0 0 280 280">
                <defs>
                  <mask id="cs-avatar-mask">
                    <rect width="280" height="280" fill="white" />
                    <circle cx="140" cy="140" r="120" fill="black" />
                  </mask>
                </defs>
                <rect width="280" height="280" fill="rgba(15, 23, 42, 0.55)" mask="url(#cs-avatar-mask)" />
                <circle cx="140" cy="140" r="120" fill="none" stroke="white" strokeWidth="2" strokeDasharray="6 4" opacity="0.8" />
              </svg>
            </div>
          </div>

          {/* Controls: Zoom slider, Zoom buttons, Rotate button, Reset button */}
          <div className="flex w-full items-center justify-between gap-3 px-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, Number((z - 0.2).toFixed(2))))}
                disabled={zoom <= 1 || processing}
                aria-label={t("zoom")}
                className="flex size-8 items-center justify-center rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-100 disabled:opacity-40"
              >
                <ZoomOut className="size-4" />
              </button>
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={zoom}
                disabled={processing}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label={t("zoom")}
                className="h-1.5 w-24 sm:w-32 accent-brand-600 cursor-pointer disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.2).toFixed(2))))}
                disabled={zoom >= 3 || processing}
                aria-label={t("zoom")}
                className="flex size-8 items-center justify-center rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-100 disabled:opacity-40"
              >
                <ZoomIn className="size-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={rotateCw}
                disabled={processing}
                aria-label={t("rotate")}
                title={t("rotate")}
                className="flex size-8 items-center justify-center rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-100 disabled:opacity-40"
              >
                <RotateCw className="size-4" />
              </button>
              <button
                type="button"
                onClick={resetAll}
                disabled={processing}
                aria-label={t("reset")}
                title={t("reset")}
                className="flex size-8 items-center justify-center rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-100 disabled:opacity-40"
              >
                <RotateCcw className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex items-center justify-end gap-3 pt-3 border-t border-ink-100">
          <Button variant="secondary" onClick={onClose} disabled={processing}>
            {t("cancel")}
          </Button>
          <Button variant="primary" onClick={handleApply} loading={processing}>
            {t("apply")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
