"use client";

import clsx from "clsx";
import { FileText, ImageIcon, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useAction } from "@shared/api/use-action";
import { Button } from "@shared/ui/button";
import { FileViewer } from "@shared/ui/file-viewer";
import { Select } from "@shared/ui/select";
import { formatBytes } from "@shared/lib/format";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { CaregiverDocument, DocType } from "@shared/types";
import { profileApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { DOC_TYPE_OPTIONS } from "@shared/lib/options";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;

/** Checks the API enforces, done before upload so the user gets instant feedback. */
function checkFile(file: File): "fileType" | "fileSize" | null {
  if (!ACCEPT.split(",").includes(file.type)) return "fileType";
  if (file.size > MAX_BYTES) return "fileSize";
  return null;
}

export function DocumentUploader({ defaultType = "LICENSE", compact }: { defaultType?: DocType; compact?: boolean }) {
  const t = useTranslations("caregiverB.documents");
  const L = useLabels();
  const [type, setType] = useState<DocType>(defaultType);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<"fileType" | "fileSize" | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = useAction(() => profileApi.uploadDocument(file!, type), {
    invalidate: [keys.profile],
    success: t("uploaded", { doc: L.docType(type) }),
    onSuccess: () => {
      setFile(null);
      if (input.current) input.current.value = "";
    },
  });

  function pick(f: File | undefined) {
    if (!f) return;
    const problem = checkFile(f);
    setError(problem);
    setFile(problem ? null : f);
  }

  return (
    <div className="space-y-3">
      <Select<DocType>
        aria-label={t("docType")}
        value={type}
        onChange={(v) => v && setType(v)}
        options={DOC_TYPE_OPTIONS.map((o) => ({ ...o, label: L.docType(o.value) }))}
      />
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition-colors",
          compact ? "py-5" : "py-8",
          dragging ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-brand-300 hover:bg-brand-50/40",
        )}
      >
        <UploadCloud className="size-7 text-brand-600" />
        {file ? (
          <span className="text-sm font-semibold text-ink-900">
            {file.name} <span className="font-normal text-ink-500">· {formatBytes(file.size)}</span>
          </span>
        ) : (
          <span className="text-sm text-ink-600">
            {t.rich("choose", { b: (c) => <span className="font-semibold text-brand-700">{c}</span> })}
          </span>
        )}
        <span className="text-xs text-ink-400">{t("formats")}</span>
        <input ref={input} type="file" accept={ACCEPT} capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {error && <p className="text-sm font-medium text-danger-600">{t(error)}</p>}
      <Button className="w-full" disabled={!file} loading={upload.isPending} onClick={() => upload.mutate(undefined)}>
        {t("uploadButton", { type })}
      </Button>
    </div>
  );
}

export function DocumentList({ documents }: { documents: CaregiverDocument[] }) {
  const t = useTranslations("caregiverB.documents");
  const tc = useTranslations("common.actions");
  const f = useFmt();
  const L = useLabels();
  const [open, setOpen] = useState<CaregiverDocument | null>(null);
  if (documents.length === 0) {
    return <p className="text-sm text-ink-500">{t("empty")}</p>;
  }
  return (
    <>
      <ul className="space-y-2">
        {documents.map((doc) => {
          const Icon = doc.mimeType.startsWith("image/") ? ImageIcon : FileText;
          return (
            <li key={doc.id}>
              <button
                onClick={() => setOpen(doc)}
                className="flex w-full items-center gap-3 rounded-xl border border-ink-100 p-3 text-start transition-colors hover:border-brand-300 hover:bg-brand-50/40"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900">{L.docType(doc.type)}</span>
                  <span className="block text-xs text-ink-500">
                    {doc.mimeType.split("/")[1].toUpperCase()} · {formatBytes(doc.sizeBytes)} · {f.date(doc.createdAt)}
                  </span>
                </span>
                <span className="text-sm font-semibold text-brand-700">{tc("view")}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <FileViewer
          id={open.id}
          title={L.docType(open.type)}
          mimeType={open.mimeType}
          load={() => profileApi.documentUrl(open.id)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
