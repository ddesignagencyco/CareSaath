"use client";

import { FileText, ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FileViewer } from "@shared/ui/file-viewer";
import { caregiversApi } from "@/features/admin/lib/api/admin";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { formatBytes } from "@shared/lib/format";
import type { CaregiverDocument } from "@shared/types";

export function DocumentList({ documents }: { documents: CaregiverDocument[] }) {
  const t = useTranslations("adminA.documents");
  const f = useFmt();
  const L = useLabels();
  const [open, setOpen] = useState<CaregiverDocument | null>(null);

  if (documents.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-warning-600/40 bg-warning-50 px-4 py-3 text-sm text-warning-700">
        {t("none")}
      </p>
    );
  }

  return (
    <>
      <ul className="grid gap-2 sm:grid-cols-2">
        {documents.map((doc) => {
          const Icon = doc.mimeType.startsWith("image/") ? ImageIcon : FileText;
          return (
            <li key={doc.id}>
              <button
                onClick={() => setOpen(doc)}
                className="flex w-full items-center gap-3 rounded-xl border border-ink-100 bg-white p-3 text-start transition-colors hover:border-brand-300 hover:bg-brand-50/40"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink-900">{L.docType(doc.type)}</span>
                  <span className="block text-xs text-ink-500">
                    {t("meta", { type: (doc.mimeType.split("/")[1] ?? doc.mimeType).toUpperCase(), size: formatBytes(doc.sizeBytes) })}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <FileViewer
          id={open.id}
          title={L.docType(open.type)}
          description={t("viewerDescription", { size: formatBytes(open.sizeBytes), date: f.date(open.createdAt) })}
          mimeType={open.mimeType}
          load={() => caregiversApi.documentUrl(open.caregiverId, open.id)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
