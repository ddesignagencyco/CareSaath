import { vi } from "vitest";
import { fakeJwt } from "@/test/utils";
import { session } from "@/features/admin/lib/api/session";

/** Spies behind the mocked next/navigation router (see vi.mock in each test file). */
export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

export const ADMIN_PHONE = "+923000000000";

/** Store an ADMIN session like a successful sign-in would. */
export function signInAdmin() {
  session.set({
    accessToken: fakeJwt({ sub: "admin-0001", role: "ADMIN", phone: ADMIN_PHONE, type: "access" }),
    refreshToken: "R1",
    phone: ADMIN_PHONE,
  });
}

/** Admin pages use the admin locale key ("en" | "ur"). */
export const ADMIN_LOCALE_KEY = "caresaath.admin.locale";
