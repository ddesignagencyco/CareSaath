import { createSessionStore } from "@shared/api/session";

export { decodeToken, type Session } from "@shared/api/session";

export const SESSION_KEY = "caresaath.caregiver.session";
export const session = createSessionStore(SESSION_KEY, "caresaath:caregiver-session");
