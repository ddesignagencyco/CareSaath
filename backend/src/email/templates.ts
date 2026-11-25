import { LOGO_CID } from './logo.js';

/**
 * Every email CareSaath sends, built on one layout that mirrors the web app:
 * the same logo lockup, ink scale, care-teal and marigold accents
 * (frontend/src/shared/brand.tsx, frontend/src/shared/styles/theme.css).
 *
 * Email clients ignore <style> blocks, flexbox and most modern CSS, so the
 * markup is table-based with inline styles and system fonts. The logo is an
 * inline attachment (see EmailService) because Gmail and Outlook drop SVG.
 *
 * Privacy: emails never carry phone numbers or credentials beyond the one code
 * a message exists to deliver, and codes are kept out of subjects and inbox
 * previews, which show on locked screens. Every dynamic value is escaped.
 */

const BRAND = 'CareSaath';
export const SUPPORT_EMAIL = 'info@caresaath.com';
export const WEB_URL = (process.env['FRONTEND_URL'] ?? 'https://caresaath-ui.vercel.app').replace(/\/+$/, '');

const C = {
  brand: '#167267',
  brandDeep: '#134a45',
  brandSoft: '#edf8f6',
  marigold: '#ee9b1d',
  amberInk: '#ae5913',
  amberSoft: '#fff8eb',
  danger: '#b42318',
  dangerSoft: '#fef3f2',
  ink900: '#141a18',
  ink700: '#38423f',
  ink500: '#63706c',
  ink400: '#85918e',
  ink100: '#e4eae8',
  ink50: '#f0f4f3',
  ink25: '#f7f9f8',
  white: '#ffffff',
};

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

type Variant = 'standard' | 'admin' | 'critical';

const CALLOUT: Record<Exclude<Variant, 'standard'>, { label: string; line: string; ink: string; soft: string }> = {
  admin: { label: 'Action required', line: C.marigold, ink: C.amberInk, soft: C.amberSoft },
  critical: { label: 'Urgent', line: C.danger, ink: C.danger, soft: C.dangerSoft },
};

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "+923001112233" → "•••• 2233": enough for ops to match a request, useless to anyone else. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••';
}

/* ─── Pieces ─── */

const h1 = (text: string) =>
  `<h1 class="heading-h1" style="margin:0 0 12px; font-family:${SANS}; font-size:24px; line-height:32px; font-weight:700; letter-spacing:-0.3px; color:${C.ink900}; word-break:break-word;">${esc(text)}</h1>`;

const p = (text: string, last = false) =>
  `<p style="margin:0 0 ${last ? 0 : 16}px; font-family:${SANS}; font-size:15px; line-height:24px; color:${C.ink700}; word-break:break-word;">${esc(text)}</p>`;

const small = (text: string) =>
  `<p style="margin:0; font-family:${SANS}; font-size:13px; line-height:20px; color:${C.ink500}; word-break:break-word;">${esc(text)}</p>`;

const spacer = (px: number) => `<div style="height:${px}px; line-height:${px}px; font-size:1px;">&nbsp;</div>`;

const rule = () =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px; line-height:1px; font-size:1px; background:${C.ink100};">&nbsp;</td></tr></table>`;

/** A table-cell button, so it keeps its shape in Outlook. */
function button(href: string, label: string): string {
  return `<table role="presentation" class="mobile-btn-table" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="border-radius:10px; background:${C.brand};">
      <a href="${esc(href)}" target="_blank" class="mobile-btn-link" style="display:inline-block; padding:12px 22px; font-family:${SANS}; font-size:14px; line-height:20px; font-weight:600; color:${C.white}; text-decoration:none; border-radius:10px; text-align:center;">${esc(label)}</a>
    </td>
  </tr></table>`;
}

/** The one code an OTP email exists to deliver: large, spaced, easy to copy. */
function code(value: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;"><tr>
    <td class="otp-code-box" style="background:${C.ink25}; border:1px solid ${C.ink100}; border-radius:12px; padding:18px 12px; text-align:center;">
      <span class="otp-code-text" style="font-family:${SANS}; font-size:28px; line-height:36px; font-weight:700; letter-spacing:8px; margin-left:8px; color:${C.brandDeep}; font-variant-numeric:tabular-nums; display:inline-block; word-break:break-all;">${esc(value)}</span>
    </td>
  </tr></table>`;
}

/** Severity strip for admin and urgent notifications: a quiet left edge, not a shouting badge. */
function callout(variant: Exclude<Variant, 'standard'>): string {
  const s = CALLOUT[variant];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr>
    <td style="border-left:3px solid ${s.line}; background:${s.soft}; border-radius:0 8px 8px 0; padding:10px 14px; font-family:${SANS}; font-size:13px; line-height:18px; font-weight:600; color:${s.ink}; word-break:break-word;">${esc(s.label)}</td>
  </tr></table>`;
}

/** Label / value pairs on hairlines. Empty values are skipped. */
function facts(rows: Array<[string, string | null | undefined]>): string {
  const filled = rows.filter((r): r is [string, string] => Boolean(r[1]));
  if (!filled.length) return '';
  return `<table role="presentation" class="facts-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed; width:100%;">${filled
    .map(
      ([label, value]) => `<tr>
      <td class="facts-row-label" valign="top" style="width:38%; padding:11px 8px 11px 0; border-bottom:1px solid ${C.ink100}; font-family:${SANS}; font-size:14px; line-height:20px; color:${C.ink500}; word-break:break-word;">${esc(label)}</td>
      <td class="facts-row-val" align="right" valign="top" style="width:62%; padding:11px 0 11px 8px; border-bottom:1px solid ${C.ink100}; font-family:${SANS}; font-size:14px; line-height:20px; font-weight:600; color:${C.ink900}; word-break:break-word; overflow-wrap:anywhere;">${esc(value)}</td>
    </tr>`,
    )
    .join('')}</table>`;
}

/** Numbered next steps (a real sequence, so the numbers carry meaning). */
function steps(items: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items
    .map(
      (item, i) => `<tr>
      <td valign="top" style="width:28px; padding:0 0 12px;">
        <div style="width:22px; height:22px; border-radius:11px; background:${C.brandSoft}; font-family:${SANS}; font-size:12px; line-height:22px; font-weight:700; color:${C.brand}; text-align:center;">${i + 1}</div>
      </td>
      <td valign="top" style="padding:1px 0 12px 8px; font-family:${SANS}; font-size:15px; line-height:22px; color:${C.ink700}; word-break:break-word;">${esc(item)}</td>
    </tr>`,
    )
    .join('')}</table>`;
}

/** The site's lockup: logo mark, "Care" + teal "Saath", marigold rule and HOME CARE. */
function lockup(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="middle" style="width:40px;"><img src="cid:${LOGO_CID}" width="40" height="40" alt="${BRAND}" style="display:block; width:40px; height:40px; border:0; border-radius:12px;"></td>
    <td valign="middle" style="padding-left:12px;">
      <div style="font-family:${SANS}; font-size:19px; line-height:20px; font-weight:800; letter-spacing:-0.3px; color:${C.ink900};">Care<span style="color:${C.brand};">Saath</span></div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr>
        <td valign="middle" style="width:12px;"><div style="width:12px; height:1px; line-height:1px; font-size:1px; background:${C.marigold};">&nbsp;</div></td>
        <td valign="middle" style="padding-left:6px; font-family:${SANS}; font-size:10px; line-height:12px; font-weight:700; letter-spacing:2px; color:${C.ink500};">HOME CARE</td>
      </tr></table>
    </td>
  </tr></table>`;
}

function footer(): string {
  const link = (href: string, label: string) =>
    `<a href="${href}" target="_blank" style="color:${C.ink500}; text-decoration:underline;">${label}</a>`;
  return `<p style="margin:0 0 10px; font-family:${SANS}; font-size:12px; line-height:19px; color:${C.ink500}; word-break:break-word;">Verified home nursing and physiotherapy across Pakistan — booked, tracked and paid from one app, in Urdu or English.</p>
    <p style="margin:0 0 10px; font-family:${SANS}; font-size:12px; line-height:19px; color:${C.ink500}; word-break:break-word;">Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:${C.brand}; text-decoration:none; font-weight:600;">${SUPPORT_EMAIL}</a></p>
    <p style="margin:0; font-family:${SANS}; font-size:12px; line-height:19px; color:${C.ink400}; word-break:break-word;">${link(`${WEB_URL}/privacy`, 'Privacy')} &nbsp;·&nbsp; ${link(`${WEB_URL}/terms`, 'Terms')} &nbsp;·&nbsp; ${link(`${WEB_URL}/contact`, 'Contact')}<br>&copy; ${new Date().getFullYear()} ${BRAND}. This is an automated message; replies are not monitored.</p>`;
}

/** Page shell: hidden inbox preview, lockup, white card, footer with responsive mobile styles. */
function layout(preview: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${BRAND}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    body, table, td, p, a, span, h1 { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      -webkit-text-size-adjust: 100% !important;
      -ms-text-size-adjust: 100% !important;
    }
    table, td {
      mso-table-lspace: 0pt !important;
      mso-table-rspace: 0pt !important;
      border-collapse: collapse !important;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      outline: none;
      text-decoration: none;
    }
    *, *:before, *:after {
      box-sizing: border-box;
    }
    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }
    @media only screen and (max-width: 600px) {
      .email-wrapper {
        padding: 20px 10px 32px !important;
      }
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .card-cell {
        padding: 24px 16px 20px !important;
        border-radius: 12px !important;
      }
      .heading-h1 {
        font-size: 20px !important;
        line-height: 28px !important;
      }
      .otp-code-box {
        padding: 14px 8px !important;
      }
      .otp-code-text {
        font-size: 24px !important;
        line-height: 30px !important;
        letter-spacing: 5px !important;
        margin-left: 5px !important;
      }
      .facts-row-label {
        font-size: 13px !important;
        line-height: 18px !important;
        padding: 9px 4px 9px 0 !important;
        width: 42% !important;
      }
      .facts-row-val {
        font-size: 13px !important;
        line-height: 18px !important;
        padding: 9px 0 9px 4px !important;
        width: 58% !important;
      }
      .mobile-btn-table {
        width: 100% !important;
      }
      .mobile-btn-link {
        display: block !important;
        width: 100% !important;
        text-align: center !important;
        padding: 13px 16px !important;
      }
      .footer-cell {
        padding: 20px 4px 0 !important;
      }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:${C.ink50}; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <div style="display:none; max-height:0; max-width:0; overflow:hidden; opacity:0; mso-hide:all;">${esc(preview)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; min-width:100%; background:${C.ink50};">
    <tr>
      <td align="center" class="email-wrapper" style="padding:40px 16px 48px;">
        <!--[if (gte mso 9)|(IE)]>
        <table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
        <![endif]-->
        <table role="presentation" class="email-container" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px; table-layout:fixed;">
          <tr><td style="padding:0 0 24px;">${lockup()}</td></tr>
          <tr>
            <td class="card-cell" style="background:${C.white}; border:1px solid ${C.ink100}; border-radius:16px; padding:36px 32px 30px; word-break:break-word;">
              ${body}
            </td>
          </tr>
          <tr><td class="footer-cell" style="padding:28px 4px 0; word-break:break-word;">${footer()}</td></tr>
        </table>
        <!--[if (gte mso 9)|(IE)]>
            </td>
          </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ─── Emails ─── */

/** Any catalogue notification event (booking, visit, payment, safety, admin queue). */
export function renderNotificationEmail(opts: {
  title: string;
  message?: string;
  variant?: Variant;
  facts?: Array<[string, string | null | undefined]>;
  action?: { label: string; url: string };
}): string {
  const variant = opts.variant ?? 'standard';
  const factsHtml = opts.facts && opts.facts.length > 0 ? facts(opts.facts) : '';
  const actionButton = opts.action
    ? button(opts.action.url, opts.action.label)
    : button(WEB_URL, 'View in CareSaath');

  return layout(
    opts.message || opts.title,
    [
      variant === 'standard' ? '' : callout(variant),
      h1(opts.title),
      opts.message ? p(opts.message) : '',
      factsHtml ? spacer(8) + factsHtml + spacer(16) : '',
      spacer(8),
      actionButton,
    ].join(''),
  );
}

/** Subject for the account holder's own code email. Never contains the code. */
export function otpEmailSubject(purpose: 'login' | 'sign-up'): string {
  return purpose === 'sign-up' ? 'Confirm your CareSaath account' : 'Your CareSaath sign-in code';
}

/** The code a person signs in or signs up with. */
export function renderOtpEmail(opts: { code: string; purpose: 'login' | 'sign-up'; ttlMinutes: number }): string {
  const signup = opts.purpose === 'sign-up';
  const minutes = `${opts.ttlMinutes} minute${opts.ttlMinutes === 1 ? '' : 's'}`;
  return layout(
    signup ? `Your verification code expires in ${minutes}.` : `Your sign-in code expires in ${minutes}.`,
    [
      h1(signup ? 'Confirm your account' : 'Sign in to CareSaath'),
      p(signup ? 'Enter this code in CareSaath to finish creating your account.' : 'Enter this code in CareSaath to sign in.'),
      spacer(4),
      code(opts.code),
      spacer(16),
      p(`The code expires in ${minutes} and can be used once.`, true),
      spacer(28),
      rule(),
      spacer(20),
      small(
        "CareSaath staff will never ask you for this code. If you didn't request it, you can ignore this email — your account stays secure without it.",
      ),
    ].join(''),
  );
}

const PURPOSE_LABEL: Record<string, string> = {
  LOGIN: 'Sign-in',
  SIGNUP: 'Sign-up',
  CHANGE_PHONE: 'Phone change',
  VISIT_CHECKIN: 'Visit check-in',
};

/** "VISIT_CHECKIN" → "Visit check-in"; unknown purposes fall back to sentence case. */
function purposeLabel(purpose: string): string {
  const words = purpose.replace(/_/g, ' ').toLowerCase();
  return PURPOSE_LABEL[purpose] ?? words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Code email for the account holder only. The subject names the purpose but
 * never the code; the body is the only place the code appears.
 */
export function otpCodeEmailSubject(purpose: string): string {
  return `Your CareSaath ${purposeLabel(purpose).toLowerCase()} code`;
}

/** A one-time code for purposes other than login/sign-up (e.g. visit check-in). */
export function renderOtpCodeEmail(opts: {
  code: string;
  purpose: string;
  ttlMinutes: number;
}): string {
  const label = purposeLabel(opts.purpose);
  const minutes = `${opts.ttlMinutes} minute${opts.ttlMinutes === 1 ? '' : 's'}`;
  return layout(
    `Your ${label.toLowerCase()} code expires in ${minutes}.`,
    [
      h1(`${label} verification code`),
      p(`Enter this code in CareSaath to continue with ${label.toLowerCase()}.`),
      spacer(4),
      code(opts.code),
      spacer(16),
      p(`The code expires in ${minutes} and can be used once.`, true),
      spacer(28),
      rule(),
      spacer(20),
      small(
        "CareSaath staff will never ask you for this code. If you didn't request it, you can ignore this email — your account stays secure without it.",
      ),
    ].join(''),
  );
}

/** Subject for the ops-inbox copy. Names the purpose only, never the code or the number. */
export function otpMirrorSubject(purpose: string): string {
  return `CareSaath ops · ${purposeLabel(purpose)} code issued`;
}

/** Ops-inbox copy of a code (never logged; emailed to the configured mirror only). */
export function renderOtpMirrorEmail(opts: {
  code: string;
  purpose: string;
  phone: string;
  role?: string | null;
  visitId?: string | null;
  ttlMinutes: number;
}): string {
  const purpose = purposeLabel(opts.purpose);
  return layout(
    `${purpose} code issued.`,
    [
      callout('admin'),
      h1('Verification code issued'),
      p(`${purpose} code sent. Share it only with the verified account holder, after confirming their identity.`),
      spacer(4),
      code(opts.code),
      spacer(20),
      facts([
        ['Purpose', purpose],
        ['Phone', maskPhone(opts.phone)],
        ['Role', opts.role ? opts.role.charAt(0) + opts.role.slice(1).toLowerCase() : null],
        ['Visit reference', opts.visitId],
        ['Valid for', `${opts.ttlMinutes} minutes`],
      ]),
      spacer(20),
      small('Sent to the operations inbox only. Do not forward this email.'),
    ].join(''),
  );
}

/** Sent the first time a user adds an email address to their CareSaath account. */
export function renderWelcomeEmail(opts: { name?: string | null; role: string }): string {
  const first = opts.name?.trim().split(/\s+/)[0] || '';
  const caregiver = opts.role === 'CAREGIVER';
  return layout(
    caregiver ? 'Your caregiver account is ready for updates by email.' : 'Your account is ready for updates by email.',
    [
      h1(first ? `Welcome, ${first}` : 'Welcome to CareSaath'),
      p(
        caregiver
          ? "Your email is now linked to your caregiver account. We'll send booking requests, visit reminders and payout updates here, alongside the app."
          : "Your email is now linked to your account. We'll send booking confirmations, visit updates and receipts here, alongside the app.",
      ),
      spacer(8),
      steps(
        caregiver
          ? ['Complete your profile and upload your documents', 'Set your weekly availability', 'Accept your first booking request']
          : ['Add the patient and your home address', 'Choose a verified nurse or physiotherapist', 'Track the visit live and pay in the app'],
      ),
      spacer(12),
      button(WEB_URL, caregiver ? 'Open your dashboard' : 'Find care'),
      spacer(28),
      rule(),
      spacer(20),
      small(`Didn't add this email to a CareSaath account? Let us know at ${SUPPORT_EMAIL}.`),
    ].join(''),
  );
}

/** Admin SMTP diagnostics (POST /email/send-test). */
export function renderSmtpTestEmail(): string {
  return layout(
    'Email delivery is working.',
    [
      h1('Email delivery is working'),
      p('This test was sent from the CareSaath admin tools to confirm the mail settings. No action is needed.'),
      spacer(8),
      facts([['Sent', new Date().toUTCString()]]),
    ].join(''),
  );
}
