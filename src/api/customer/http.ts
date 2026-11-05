import { createHttp } from "../http";
import { session } from "./session";

export { API_BASE_URL, ApiError, type UploadFile } from "../http";

export const http = createHttp(session);
