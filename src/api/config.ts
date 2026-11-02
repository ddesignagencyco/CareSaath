/**
 * API settings.
 *
 * The app talks to the live CareSaath NestJS backend deployed on Render, so a
 * phone on any network reaches it directly — no dev machine, USB or tunnel.
 * For local dev instead, swap API_BASE_URL for the ngrok tunnel, or (USB)
 * `adb reverse tcp:3000 tcp:3000` + http://127.0.0.1:3000/api/v1, or (emulator)
 * http://10.0.2.2:3000/api/v1.
 *
 * USE_MOCKS switches every api.ts call back to the in-app mock (offline demo).
 */
// Live backend (Render). Local dev: 'https://finance-napkin-overstock.ngrok-free.dev/api/v1'
export const API_BASE_URL = 'https://caresaath-api.onrender.com/api/v1';

export const USE_MOCKS = false;

/** Chat is now wired to the real backend (relationship-scoped threads + Socket.IO). */
export const CHAT_USE_MOCKS = false;
