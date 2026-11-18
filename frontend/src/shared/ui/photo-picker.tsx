"use client";

import type { QueryKey } from "@tanstack/react-query";
import clsx from "clsx";
import { Camera, Loader2, Maximize2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useAction } from "../api/use-action";
import { Button } from "./button";
import { Avatar } from "./misc";
import { Modal } from "./overlay";
import { PhotoCropModal } from "./photo-crop-modal";
import { PhotoViewer } from "./photo-viewer";
import { useToast } from "./toast";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Avatar with a single camera button. Tapping it opens a small choice — update
 * the photo, or remove it when one exists — instead of showing a separate,
 * visually noisy trash icon next to the avatar. Works for every role; the
 * caller supplies the role's upload/remove calls and the query keys to refresh.
 */
export function PhotoPicker({
  name,
  photoUrl,
  size = "lg",
  upload,
  remove,
  invalidate,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  upload: (file: File) => Promise<unknown>;
  remove?: () => Promise<unknown>;
  invalidate: QueryKey[];
  className?: string;
}) {
  const t = useTranslations("common.photo");
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const uploadAction = useAction((file: File) => upload(file), { invalidate, success: t("updated") });
  const removeAction = useAction(() => (remove ? remove() : Promise.resolve()), { invalidate, success: t("removed") });
  const busy = uploadAction.isPending || removeAction.isPending;
  const hasPhoto = !!photoUrl;
  const canRemove = hasPhoto && !!remove;

  useEffect(() => {
    if (!photoUrl) setViewOpen(false);
  }, [photoUrl]);

  const openFilePicker = () => input.current?.click();
  const onCameraClick = () => (canRemove ? setChoiceOpen(true) : openFilePicker());

  return (
    <>
      <div className={clsx("relative inline-flex shrink-0", className)}>
        <Avatar name={name} src={photoUrl} size={size} />
        {hasPhoto && (
          <button
            type="button"
            onClick={() => setViewOpen(true)}
            aria-label={t("view")}
            title={t("view")}
            className="absolute -start-1 -bottom-1 z-10 flex size-7 items-center justify-center rounded-full bg-white text-ink-700 ring-2 ring-brand-600 hover:bg-ink-50"
          >
            <Maximize2 className="size-3.5" aria-hidden />
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onCameraClick}
          aria-label={hasPhoto ? t("change") : t("add")}
          className="absolute -end-1 -bottom-1 z-10 flex size-7 items-center justify-center rounded-full bg-brand-600 text-white ring-2 ring-white hover:bg-brand-700 disabled:opacity-60"
        >
          {uploadAction.isPending || removeAction.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Camera className="size-3.5" />
          )}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (!PHOTO_TYPES.includes(file.type) || file.size > PHOTO_MAX_BYTES) {
              toast.error(t("invalid"));
            } else {
              setPendingFile(file);
            }
          }}
        />
      </div>

      <Modal
        open={choiceOpen}
        onClose={() => setChoiceOpen(false)}
        title={t("manageTitle")}
        description={t("manageDescription")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setChoiceOpen(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setChoiceOpen(false);
                removeAction.mutate(undefined);
              }}
              disabled={busy}
            >
              <Trash2 className="size-4" aria-hidden />
              {t("remove")}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setChoiceOpen(false);
                openFilePicker();
              }}
              disabled={busy}
            >
              <Camera className="size-4" aria-hidden />
              {t("update")}
            </Button>
          </>
        }
      />

      <PhotoCropModal
        open={!!pendingFile}
        file={pendingFile}
        onClose={() => setPendingFile(null)}
        onCrop={(croppedFile) => {
          setPendingFile(null);
          uploadAction.mutate(croppedFile);
        }}
      />

      {viewOpen && photoUrl && (
        <PhotoViewer src={photoUrl} name={name} onClose={() => setViewOpen(false)} />
      )}
    </>
  );
}
