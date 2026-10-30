"use client";

import { useTranslations } from "next-intl";

/**
 * Small embedded map of a location (no API key needed). Turn-by-turn
 * navigation still goes to the Maps app via a Directions link.
 */
export function LocationMap({ lat, lng, label, className }: { lat: string; lng: string; label: string; className?: string }) {
  const t = useTranslations("shared.map");
  return (
    <div className={`overflow-hidden rounded-xl border border-ink-100 bg-ink-50 ${className ?? ""}`}>
      <iframe
        title={t("title", { label })}
        src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-44 w-full border-0"
      />
    </div>
  );
}
