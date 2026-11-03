import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
  // Expire any cookies a test set (cs_session / cs_csrf) — jsdom keeps
  // document.cookie across tests, so a session would otherwise leak forward.
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0].trim();
    if (name) document.cookie = `${name}=; max-age=0; path=/`;
  }
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
});
