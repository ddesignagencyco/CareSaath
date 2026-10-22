"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useState } from "react";
import { Avatar } from "@shared/ui/misc";
import { profileApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";

const SIZE = { sm: "size-8", md: "size-10", lg: "size-14" } as const;

/**
 * Signed URL for the caregiver's own photo (GET /caregiver/photo/url). The URL
 * expires after ~5 minutes, so it is refreshed before that and only ever used
 * as an in-app <img> source — never linked or opened in a new tab.
 */
export function usePhotoUrl(photoKey: string | null | undefined) {
  return useQuery({
    queryKey: [...keys.profile, "photo-url", photoKey],
    queryFn: profileApi.photoUrl,
    enabled: !!photoKey,
    staleTime: 4 * 60_000,
    refetchInterval: 4 * 60_000,
    retry: false,
    select: (r) => r.url,
  }).data;
}

/** Profile photo when one is uploaded and loads; initials otherwise. */
export function PhotoAvatar({
  name,
  photoKey,
  size = "md",
  className,
}: {
  name: string;
  photoKey: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const url = usePhotoUrl(photoKey);
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) return <Avatar name={name} size={size} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed URL, not optimisable
    <img
      src={url}
      alt=""
      aria-hidden
      referrerPolicy="no-referrer"
      onError={() => setFailed(url)}
      className={clsx("shrink-0 rounded-full bg-brand-100 object-cover", SIZE[size], className)}
    />
  );
}
