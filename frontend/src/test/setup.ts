import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { __resetSessionForTests } from "@shared/api/session";
import { setCsrf } from "@shared/api/http";

afterEach(() => {
  cleanup();
  localStorage.clear();
  __resetSessionForTests(); // clear in-memory session marker + role + bootstrap gate
  setCsrf(undefined);
  // Expire any cookies a test set (cs_session / cs_csrf) — jsdom keeps
  // document.cookie across tests, so a session would otherwise leak forward.
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0].trim();
    if (name) document.cookie = `${name}=; max-age=0; path=/`;
  }
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
});
