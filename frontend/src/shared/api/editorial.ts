import { API_ACCESS_KEY, API_BASE_URL } from "./http";
import type { ContactInfo, EditorialPage } from "../types";

export const DEFAULT_CONTACT_INFO: ContactInfo = {
  email: "info@caresaath.com",
  caregiverEmail: "caregivers@caresaath.pk",
  pressEmail: "hello@caresaath.pk",
  phone: "+92 42 111 227 372",
  whatsapp: "+92 300 2273728",
  address: "Main Gulberg III, Lahore, Pakistan",
  hours: "Mon – Sat: 9:00 AM – 9:00 PM PKT (24/7 Visit SOS Support)",
};

function publicHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    ...(API_ACCESS_KEY ? { "x-api-key": API_ACCESS_KEY } : {}),
  };
}

/**
 * Fetches a public editorial page by slug from GET /api/v1/editorial/pages/:slug.
 * Returns null if the backend is unreachable so public pages can gracefully fall back.
 */
export async function fetchEditorialPage(slug: string): Promise<EditorialPage | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/editorial/pages/${encodeURIComponent(slug)}`, {
      headers: publicHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as EditorialPage;
    if (!data || typeof data.content !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetches public platform contact details from GET /api/v1/editorial/contact-info.
 * Merges with defaults if any field is empty or if the backend is unreachable.
 */
export async function fetchContactInfo(): Promise<ContactInfo> {
  try {
    const res = await fetch(`${API_BASE_URL}/editorial/contact-info`, {
      headers: publicHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return DEFAULT_CONTACT_INFO;
    const data = (await res.json()) as Partial<ContactInfo>;
    return {
      email: data.email?.trim() || DEFAULT_CONTACT_INFO.email,
      caregiverEmail: data.caregiverEmail?.trim() || DEFAULT_CONTACT_INFO.caregiverEmail,
      pressEmail: data.pressEmail?.trim() || DEFAULT_CONTACT_INFO.pressEmail,
      phone: data.phone?.trim() || DEFAULT_CONTACT_INFO.phone,
      whatsapp: data.whatsapp?.trim() || DEFAULT_CONTACT_INFO.whatsapp,
      address: data.address?.trim() || DEFAULT_CONTACT_INFO.address,
      hours: data.hours?.trim() || DEFAULT_CONTACT_INFO.hours,
    };
  } catch {
    return DEFAULT_CONTACT_INFO;
  }
}
