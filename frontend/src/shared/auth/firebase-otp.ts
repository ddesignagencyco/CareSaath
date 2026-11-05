"use client";

/**
 * Client-side Firebase phone-auth (real SMS OTP).
 *
 * This is OPTIONAL and additive: it only activates when the NEXT_PUBLIC_FIREBASE_*
 * env vars are set. When they are not, `firebaseEnabled` is false and callers fall
 * back to the backend email/dev-OTP flow (`/auth/otp/*`), which is left unchanged.
 *
 * Flow when enabled:
 *   1. firebaseRequestOtp(phone) renders an invisible reCAPTCHA and asks Firebase
 *      to send the SMS code (Google's SMS, reCAPTCHA-gated).
 *   2. firebaseConfirmOtp(code) confirms the code with Firebase and returns the
 *      resulting ID token.
 *   3. The caller hands that ID token to the backend `POST /auth/firebase/verify`,
 *      which trusts Firebase's verification and issues our own access/refresh tokens.
 *
 * firebase is pulled in via dynamic import() so the SDK is only downloaded in the
 * browser when a sign-in is actually attempted (and never on the server).
 */

import type { Auth, ConfirmationResult, RecaptchaVerifier } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * True only when Firebase phone-auth is explicitly switched ON *and* configured.
 * The explicit NEXT_PUBLIC_FIREBASE_ENABLED flag is a deliberate guard: having the
 * config present must NOT auto-fire real SMS (Firebase's free tier is tiny), so SMS
 * stays off — callers fall back to the backend OTP flow — until someone sets the
 * flag to "true" to actually test the SMS path.
 */
export const firebaseEnabled = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED === "true" && config.apiKey && config.authDomain && config.projectId,
);

/** The invisible reCAPTCHA mounts into this element; LoginScreen renders a matching <div>. */
export const RECAPTCHA_CONTAINER_ID = "firebase-recaptcha";

/** The role carried to the backend the first time a phone number signs in via Firebase. */
export type FirebaseSignupRole = "CUSTOMER" | "CAREGIVER";
export interface FirebaseVerifyBody {
  idToken: string;
  fullName?: string;
  email?: string;
  role?: FirebaseSignupRole;
}

let authInstance: Auth | null = null;
let verifier: RecaptchaVerifier | null = null;
let confirmation: ConfirmationResult | null = null;

async function getFirebaseAuth(): Promise<Auth> {
  if (authInstance) return authInstance;
  const { initializeApp, getApps, getApp } = await import("firebase/app");
  const { getAuth } = await import("firebase/auth");
  const app = getApps().length ? getApp() : initializeApp(config as Record<string, string>);
  authInstance = getAuth(app);
  return authInstance;
}

/** A fresh invisible reCAPTCHA for each send — Firebase consumes one verifier per request. */
async function freshVerifier(auth: Auth): Promise<RecaptchaVerifier> {
  const { RecaptchaVerifier } = await import("firebase/auth");
  if (verifier) {
    try {
      verifier.clear();
    } catch {
      // ignore — the element may already be gone
    }
    verifier = null;
  }
  // Empty the container before rendering again: clear() does not always remove the
  // widget DOM, and a non-empty element throws "reCAPTCHA has already been rendered
  // in this element" on the next send (e.g. Resend, or after a failed attempt).
  if (typeof document !== "undefined") {
    const el = document.getElementById(RECAPTCHA_CONTAINER_ID);
    if (el) el.innerHTML = "";
  }
  verifier = new RecaptchaVerifier(auth, RECAPTCHA_CONTAINER_ID, { size: "invisible" });
  return verifier;
}

/** Ask Firebase to SMS a 6-digit code to `phone` (E.164). Throws on failure. */
export async function firebaseRequestOtp(phone: string): Promise<void> {
  const auth = await getFirebaseAuth();
  const { signInWithPhoneNumber } = await import("firebase/auth");
  const appVerifier = await freshVerifier(auth);
  confirmation = await signInWithPhoneNumber(auth, phone, appVerifier);
}

/** Confirm `code` with Firebase and return the ID token for the backend to verify. */
export async function firebaseConfirmOtp(code: string): Promise<string> {
  if (!confirmation) throw new Error("Request a code first.");
  const credential = await confirmation.confirm(code);
  return credential.user.getIdToken();
}

/**
 * Resolve a token pair from a submitted `code`:
 *  - Firebase enabled → confirm the code, then POST the ID token to the backend's
 *    `firebaseVerify` (carrying name/email/role for a first-time signup).
 *  - otherwise → the caller's existing backend OTP verify, unchanged.
 */
export async function tokensFromOtp<T>(opts: {
  code: string;
  firebaseVerify: (body: FirebaseVerifyBody) => Promise<T>;
  backendVerify: () => Promise<T>;
  signup?: { fullName?: string; email?: string; role?: FirebaseSignupRole };
}): Promise<T> {
  if (!firebaseEnabled) return opts.backendVerify();
  const idToken = await firebaseConfirmOtp(opts.code);
  return opts.firebaseVerify({ idToken, ...opts.signup });
}

/**
 * Wrap a page's existing `requestOtp` so it sends via Firebase when enabled.
 * Returns `{}` in the Firebase path.
 */
export function makeRequestOtp(
  backendRequest: (phone: string, name?: string, email?: string) => Promise<unknown>,
): (phone: string, name?: string, email?: string) => Promise<unknown> {
  return async (phone, name, email) => {
    if (!firebaseEnabled) return backendRequest(phone, name, email);
    await firebaseRequestOtp(phone);
    return {};
  };
}
