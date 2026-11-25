"use client";

import { API_BASE_URL } from "@shared/api/http";
import { Avatar } from "./misc";

/**
 * Avatar backed by the public `GET /customer/:userId/photo` route. Any account
 * holder (customer, caregiver, admin) can be rendered from just their user id;
 * when there is no photo the request 404s and `Avatar` falls back to initials.
 *
 * If the caller already has a real `photoUrl` from an API payload, pass it — it
 * is used directly so the avatar never has to depend on the public route.
 */
export function UserAvatar({
  userId,
  name,
  photoUrl,
  size = "md",
  className,
}: {
  userId?: string | null;
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const src =
    photoUrl ||
    (userId ? `${API_BASE_URL}/customer/${userId}/photo` : null);
  return <Avatar name={name} src={src} size={size} className={className} />;
}
