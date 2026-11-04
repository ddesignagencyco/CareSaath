"use client";

import { useEffect } from "react";
import { bootstrapSession } from "@shared/api/http";
import { beginBootstrap, finishBootstrap, setSessionRole } from "@shared/api/session";
import { session as adminSession } from "@/features/admin/lib/api/session";
import { session as caregiverSession } from "@/features/caregiver/lib/api/session";
import { session as customerSession } from "@/features/customer/lib/api/session";

// Flip the bootstrap gate ON at module load — before any section shell renders —
// so the shells wait for the reload-time rehydrate instead of flashing "logged
// out" and redirecting. This module is only imported by the app root, never by
// unit tests, so tests keep the synchronous "hydrated right after mount" behaviour.
if (typeof window !== "undefined") beginBootstrap();

/**
 * On a fresh page load, rehydrate the in-memory session from the httpOnly cookies
 * via GET /auth/session (nothing is persisted client-side). Renders nothing.
 */
export function SessionBootstrap() {
  useEffect(() => {
    bootstrapSession()
      .then((d) => {
        if (!d) return;
        setSessionRole(d.role);
        const store = d.role === "CAREGIVER" ? caregiverSession : d.role === "ADMIN" ? adminSession : customerSession;
        store.set({ phone: d.phone });
      })
      .finally(finishBootstrap);
  }, []);
  return null;
}
