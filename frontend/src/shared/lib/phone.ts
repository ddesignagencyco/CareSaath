/**
 * Pakistani mobile numbers only (pilot is Pakistan-only).
 *
 * Accepted input shapes, spaces/dashes ignored:
 *   0300 1234567     11 digits, leading 0
 *   300 1234567      10 digits
 *   92 300 1234567   12 digits, country code
 *   +92 300 1234567  E.164
 *   0092 300 1234567 international prefix
 *
 * The 10-digit national part must be 3XX XXXXXXX with an operator code
 * 30–35 (Jazz, Zong, Warid, Ufone, Telenor, SCOM).
 */

const NATIONAL = /^3[0-5]\d{8}$/;

export type PhoneErrorCode =
  | "empty"
  | "digitsOnly"
  | "notPakistan"
  | "length92"
  | "length0"
  | "length10"
  | "lengthAfter92"
  | "notMobile"
  | "operator";

/** `error` is English; translated UIs use `code` (messages `shared.phone.<code>`). */
export type PhoneResult = { ok: true; e164: string } | { ok: false; code: PhoneErrorCode; error: string };

const fail = (code: PhoneErrorCode, error: string): PhoneResult => ({ ok: false, code, error });

export function parsePkMobile(input: string): PhoneResult {
  const raw = input.trim().replace(/[\s\-().]/g, "");
  if (!raw) return fail("empty", "Enter your mobile number");
  if (!/^\+?\d+$/.test(raw)) return fail("digitsOnly", "Use digits only");

  let national: string;
  if (raw.startsWith("+")) {
    if (!raw.startsWith("+92")) return fail("notPakistan", "Only Pakistani (+92) numbers are supported");
    national = raw.slice(3);
  } else if (raw.startsWith("0092")) {
    national = raw.slice(4);
  } else if (raw.startsWith("92")) {
    if (raw.length !== 12) return fail("length92", "With 92, the number must be 12 digits (92 300 1234567)");
    national = raw.slice(2);
  } else if (raw.startsWith("0")) {
    if (raw.length !== 11) return fail("length0", "With a leading 0, the number must be 11 digits (0300 1234567)");
    national = raw.slice(1);
  } else {
    if (raw.length !== 10) return fail("length10", "The number must be 10 digits (300 1234567)");
    national = raw;
  }

  if (national.length !== 10) return fail("lengthAfter92", "The number after +92 must be 10 digits");
  if (!national.startsWith("3")) return fail("notMobile", "Enter a mobile number (starts with 03)");
  if (!NATIONAL.test(national)) return fail("operator", "Not a valid Pakistani mobile operator code (030–035)");
  return { ok: true, e164: `+92${national}` };
}

/** Keep only what a phone number can contain while typing. */
export function sanitizePhoneInput(input: string): string {
  return input.replace(/[^\d+\s-]/g, "").replace(/(?!^)\+/g, "").slice(0, 17);
}

/**
 * "+923001234567" -> "+92 300 1234567"; other values pass through.
 * Wrapped in Unicode LTR isolates so the "+" stays in front inside Urdu (RTL) text.
 */
export function formatPkMobile(e164: string): string {
  const m = /^\+92(3\d{2})(\d{7})$/.exec(e164);
  return `⁦${m ? `+92 ${m[1]} ${m[2]}` : e164}⁩`;
}
