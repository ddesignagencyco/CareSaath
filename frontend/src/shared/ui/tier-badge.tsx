"use client";

import clsx from "clsx";
import { Award } from "lucide-react";
import { useLabels } from "@shared/i18n/use-labels";
import type { CaregiverBadge } from "@shared/types";

const BADGE_STYLE: Record<CaregiverBadge, string> = {
  BRONZE: "bg-[#f4e3d3] text-[#8a5a2f] ring-[#e6cbb0]",
  SILVER: "bg-[#e9edf1] text-[#58687a] ring-[#d4dbe2]",
  GOLD: "bg-[#fbeec2] text-[#8a6a12] ring-[#f0dc94]",
  PLATINUM: "bg-brand-50 text-brand-700 ring-brand-200",
};

/** Caregiver ranking tier chip (BRONZE…PLATINUM), shown to families and to the caregiver themselves. */
export function TierBadge({ badge, className }: { badge: CaregiverBadge; className?: string }) {
  const L = useLabels();
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ring-1", BADGE_STYLE[badge], className)}>
      <Award className="size-3.5" /> {L.caregiverBadge(badge)}
    </span>
  );
}
