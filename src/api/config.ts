/**
 * API settings.
 *
 * The app talks to the live CareSaath NestJS backend deployed on Render, so a
 * phone on any network reaches it directly — no dev machine, USB or tunnel.
 * For local dev instead, swap API_BASE_URL for the ngrok tunnel, or (USB)
 * `adb reverse tcp:3000 tcp:3000` + http://127.0.0.1:3000/api/v1, or (emulator)
 * http://10.0.2.2:3000/api/v1.
 */
// Live backend (Render). Local dev: swap for your ngrok tunnel, e.g. 'https://<id>.ngrok-free.dev/api/v1'.
export const API_BASE_URL = 'https://caresaath-api.onrender.com/api/v1';
