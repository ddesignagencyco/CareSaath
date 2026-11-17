"use client";

import { API_BASE_URL } from "@shared/api/http";
import { Avatar } from "./misc";

/**
 * Avatar backed by the public `GET /customer/:userId/photo` route. Any account
 * holder (customer, caregiver, admin) can be rendered from just their user id;
 * when there is no photo the request 404s and `Avatar` falls back to initials.
 */
export function UserAvatar({
  userId,
  name,
  size = "md",
  className,
}: {
  userId?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return <Avatar name={name} src={userId ? `${API_BASE_URL}/customer/${userId}/photo` : null} size={size} className={className} />;
}
