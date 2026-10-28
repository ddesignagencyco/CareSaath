import { createSessionStore } from "../session";

export { decodeToken, type Session } from "../session";

export const SESSION_KEY = "caresaath.customer.session";
export const session = createSessionStore(SESSION_KEY);
