"use client";

import type { QueryKey } from "@tanstack/react-query";
import clsx from "clsx";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useAction } from "../api/use-action";
import { Avatar } from "./misc";
import { PhotoCropModal } from "./photo-crop-modal";
import { useToast } from "./toast";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Avatar with a camera button that uploads a new profile photo, and an optional
 * remove button. Works for every role; the caller supplies the role's upload
 * call and the query keys to refresh after a change.
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
  const uploadAction = useAction((file: File) => upload(file), { invalidate, success: t("updated") });
  const removeAction = useAction(() => (remove ? remove() : Promise.resolve()), { invalidate, success: t("removed") });
  const busy = uploadAction.isPending || removeAction.isPending;
  const hasPhoto = !!photoUrl;

  return (
    <>
      <div className={clsx("relative inline-flex shrink-0", className)}>
        <Avatar name={name} src={photoUrl} size={size} />
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          aria-label={hasPhoto ? t("change") : t("add")}
          className="absolute -end-1 -bottom-1 flex size-7 items-center justify-center rounded-full bg-brand-600 text-white ring-2 ring-white hover:bg-brand-700 disabled:opacity-60"
        >
          {uploadAction.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
        </button>
        {hasPhoto && remove && (
          <button
            type="button"
            disabled={busy}
            onClick={() => removeAction.mutate(undefined)}
            aria-label={t("remove")}
            className="absolute -end-1 -top-1 flex size-6 items-center justify-center rounded-full bg-white text-ink-500 ring-2 ring-white shadow-sm hover:text-danger-600 disabled:opacity-60"
          >
            {removeAction.isPending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
          </button>
        )}
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

      <PhotoCropModal
        open={!!pendingFile}
        file={pendingFile}
        onClose={() => setPendingFile(null)}
        onCrop={(croppedFile) => {
          setPendingFile(null);
          uploadAction.mutate(croppedFile);
        }}
      />
    </>
  );
}
