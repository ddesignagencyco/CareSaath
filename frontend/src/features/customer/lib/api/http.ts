import { createHttp } from "@shared/api/http";
import { session } from "./session";

export { API_BASE_URL, ApiError } from "@shared/api/http";

export const http = createHttp(session);
