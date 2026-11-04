import { createSessionStore } from "../session";

export { decodeToken, isTokenExpired, type Session } from "../session";

export const SESSION_KEY = "caresaath.caregiver.session";
export const session = createSessionStore(SESSION_KEY);
