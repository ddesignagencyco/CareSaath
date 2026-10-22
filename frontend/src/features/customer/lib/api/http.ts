import { createHttp } from "@shared/api/http";
import { session } from "./session";

export { API_BASE_URL, ApiError, USE_MOCKS } from "@shared/api/http";

export const http = createHttp(session);
