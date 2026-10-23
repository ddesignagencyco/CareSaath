/**
 * Helpers for the live-backend flow tests (local development only).
 *
 * Authentication mirrors the backend's own E2E helper
 * (`backend/test/e2e-helpers.ts` → `signAccessToken`): a token is signed with
 * the dev `JWT_ACCESS_SECRET` for a user row we created, which "bypasses the
 * OTP flow". Test users get fresh phone numbers so the seeded demo data is
 * never touched.
 */
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Minimal localStorage so the section session stores work under the Node environment.
if (!("localStorage" in globalThis)) {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (k: string) => void map.delete(k),
      setItem: (k: string, v: string) => void map.set(k, String(v)),
    },
    configurable: true,
  });
}

const REPO_ROOT = path.resolve(process.cwd(), "..");
const PG_CONTAINER = process.env.E2E_PG_CONTAINER ?? "docker-postgres-1";

/** Read KEY=VALUE pairs from the repo-root .env (dev secrets). */
function loadEnv(): Record<string, string> {
  const file = path.join(REPO_ROOT, ".env");
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const ENV = loadEnv();
const base64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Sign an HS256 JWT (same shape the backend issues). */
function sign(payload: Record<string, unknown>, secret: string, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const head = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

/** Run one SQL statement in the dev Postgres container and return raw rows. */
export function sql(statement: string): string {
  return execFileSync(
    "docker",
    ["exec", PG_CONTAINER, "psql", "-U", "caresaath", "-d", "caresaath", "-tAc", statement],
    { encoding: "utf8" },
  ).trim();
}

export type Role = "CUSTOMER" | "CAREGIVER" | "ADMIN";

export interface TestUser {
  id: string;
  phone: string;
  role: Role;
  accessToken: string;
  refreshToken: string;
}

/** Unique Pakistani mobile per run (0319 series is unused by the seed). */
export function uniquePhone(): string {
  return `+92319${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

/** Sign a fresh access/refresh pair for an existing user id (e.g. after its role changes). */
export function signSession(id: string, phone: string, role: Role): { accessToken: string; refreshToken: string } {
  return {
    accessToken: sign({ sub: id, role, phone, type: "access" }, ENV.JWT_ACCESS_SECRET, 900),
    refreshToken: sign({ sub: id, role, phone, type: "refresh" }, ENV.JWT_REFRESH_SECRET, 86_400),
  };
}

/** Insert an ACTIVE user with a fresh phone and return a signed session for it. */
export function createUser(role: Role, fullName = "E2E Test"): TestUser {
  const id = randomUUID();
  const phone = uniquePhone();
  sql(
    `INSERT INTO "User" (id, phone, role, status, "fullName", "preferredLanguage", "createdAt", "updatedAt") ` +
      `VALUES ('${id}', '${phone}', '${role}', 'ACTIVE', '${fullName.replace(/'/g, "''")}', 'EN', now(), now())`,
  );
  return {
    id,
    phone,
    role,
    accessToken: sign({ sub: id, role, phone, type: "access" }, ENV.JWT_ACCESS_SECRET, 900),
    refreshToken: sign({ sub: id, role, phone, type: "refresh" }, ENV.JWT_REFRESH_SECRET, 86_400),
  };
}

/** Put a user's tokens into the section's session store so its API functions are authenticated. */
export function signIn(section: "admin" | "caregiver" | "customer", user: TestUser): void {
  localStorage.setItem(
    `caresaath.${section}.session`,
    JSON.stringify({ accessToken: user.accessToken, refreshToken: user.refreshToken, phone: user.phone }),
  );
}

export const VALID_PNG = () =>
  new File(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    ],
    "doc.png",
    { type: "image/png" },
  );

/** A record of one checked step for the run summary. */
export interface StepResult {
  area: string;
  step: string;
  ok: boolean;
  detail: string;
}

export const results: StepResult[] = [];

/** Run `fn`, record pass/fail (and the thrown message), and return its value or undefined. */
export async function step<T>(area: string, name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const value = await fn();
    results.push({ area, step: name, ok: true, detail: "ok" });
    return value;
  } catch (err) {
    results.push({ area, step: name, ok: false, detail: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

/** Assert a condition inside a step. */
export function expectThat(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
