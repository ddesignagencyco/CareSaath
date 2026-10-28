/**
 * API settings.
 *
 * The app talks to the CareSaath NestJS backend through its ngrok tunnel, so
 * a phone on any network (no USB, no emulator) reaches the dev machine. For a
 * USB phone you can instead `adb reverse tcp:3000 tcp:3000` and use
 * http://127.0.0.1:3000/api/v1; the Android emulator reaches the host at
 * http://10.0.2.2:3000/api/v1.
 *
 * USE_MOCKS switches every api.ts call back to the in-app mock (offline demo).
 * Chat has no backend module yet, so it keeps its own mock (CHAT_USE_MOCKS).
 */
export const API_BASE_URL = 'https://finance-napkin-overstock.ngrok-free.dev/api/v1';

export const USE_MOCKS = false;

/** TODO(backend): flip once /customer/chat and /caregiver/chat exist (see api/chat/api.ts). */
export const CHAT_USE_MOCKS = true;
