import { createSessionStore } from "@shared/api/session";

export { decodeToken, type Session } from "@shared/api/session";

export const session = createSessionStore("caresaath.admin.session", "caresaath:admin-session");
