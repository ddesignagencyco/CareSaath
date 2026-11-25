"use client";

import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@shared/ui/misc";
import { profileApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";

/**
 * Signed URL for the caregiver's own photo (GET /caregiver/photo/url). The URL
 * expires after ~5 minutes, so it is refreshed before that. This returns the
 * URL only; rendering is delegated to the shared Avatar everywhere.
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
  // `key` resets Avatar's internal failed state when the photo is replaced.
  return <Avatar key={url ?? "none"} name={name} src={url ?? null} size={size} className={className} />;
}
