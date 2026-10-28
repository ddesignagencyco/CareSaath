import { createHttp } from "../http";
import { session } from "./session";

export { API_BASE_URL, ApiError, USE_MOCKS, type UploadFile } from "../http";

export const http = createHttp(session);
