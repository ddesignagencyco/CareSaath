/**
 * Every email CareSaath sends, built from one email-safe layout.
 *
 * Email clients (Gmail, Outlook, Apple Mail) ignore <style> blocks, flexbox and
 * most modern CSS, so everything here is table-based with inline styles and
 * system fonts. Colours follow the web app's brand tokens
 * (frontend/src/shared/styles/theme.css): care teal, warm amber, green-tinted inks.
 * Every value that comes from a user or the database goes through escapeHtml.
 */

const BRAND = 'CareSaath';
const SUPPORT_EMAIL = 'info@caresaath.com';
const WEB_URL = (process.env['FRONTEND_URL'] ?? 'https://caresaath-ui.vercel.app').replace(/\/+$/, '');

const COLOR = {
  brand: '#167267',
  brandDark: '#123e3a',
  brandTint: '#edf8f6',
  brandBorder: '#a8ded5',
  accent: '#d27a12',
  accentTint: '#fff8eb',
  danger: '#c62828',
  dangerTint: '#fdecea',
  ink: '#141a18',
  body: '#38423f',
  muted: '#63706c',
  line: '#e4eae8',
  page: '#f0f4f3',
  card: '#ffffff',
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";

type Variant = 'standard' | 'admin' | 'critical';

const VARIANT: Record<Variant, { accent: string; tint: string; label: string | null }> = {
  standard: { accent: COLOR.brand, tint: COLOR.brandTint, label: null },
  admin: { accent: COLOR.accent, tint: COLOR.accentTint, label: 'ACTION REQUIRED' },
  critical: { accent: COLOR.danger, tint: COLOR.dangerTint, label: 'URGENT' },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─── Building blocks ─── */

function heading(text: string): string {
  return `<h1 style="margin:0 0 12px; font-family:${FONT}; font-size:22px; line-height:30px; font-weight:700; color:${COLOR.ink};">${escapeHtml(text)}</h1>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px; font-family:${FONT}; font-size:15px; line-height:24px; color:${COLOR.body};">${escapeHtml(text)}</p>`;
}

function badge(label: string, color: string, tint: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr>
    <td style="background:${tint}; border:1px solid ${color}; border-radius:999px; padding:4px 12px; font-family:${FONT}; font-size:11px; line-height:16px; font-weight:700; letter-spacing:0.8px; color:${color};">${escapeHtml(label)}</td>
  </tr></table>`;
}

/** Bulletproof button: a padded table cell, so it renders as a button in Outlook too. */
function button(href: string, label: string, color: string = COLOR.brand): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tr>
    <td style="border-radius:10px; background:${color};">
      <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block; padding:13px 26px; font-family:${FONT}; font-size:15px; line-height:20px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px;">${escapeHtml(label)}</a>
    </td>
  </tr></table>`;
}

/** The one-time code, large and spaced so it is easy to read and copy. */
function codeBlock(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 20px;"><tr>
    <td align="center" style="background:${COLOR.brandTint}; border:1px dashed ${COLOR.brandBorder}; border-radius:12px; padding:20px 12px;">
      <span style="font-family:${MONO}; font-size:34px; line-height:40px; font-weight:700; letter-spacing:10px; color:${COLOR.brandDark};">${escapeHtml(code)}</span>
    </td>
  </tr></table>`;
}

/** Label / value rows, e.g. the context of an OTP in the ops inbox. */
function details(rows: Array<[string, string | null | undefined]>): string {
  const filled = rows.filter((row): row is [string, string] => Boolean(row[1]));
  if (filled.length === 0) return '';
  const cells = filled
    .map(([label, value], i) => {
      const divider = i ? `border-top:1px solid ${COLOR.line};` : '';
      return `<tr>
      <td style="padding:10px 14px; ${divider} font-family:${FONT}; font-size:13px; line-height:18px; color:${COLOR.muted}; width:38%;">${escapeHtml(label)}</td>
      <td style="padding:10px 14px; ${divider} font-family:${FONT}; font-size:14px; line-height:18px; font-weight:600; color:${COLOR.ink};">${escapeHtml(value)}</td>
    </tr>`;
    })
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px; border:1px solid ${COLOR.line}; border-radius:10px; border-collapse:separate;">${cells}</table>`;
}

/** A quiet note under the main content (security hints, "not you?"). */
function note(text: string): string {
  return `<p style="margin:16px 0 0; padding-top:16px; border-top:1px solid ${COLOR.line}; font-family:${FONT}; font-size:13px; line-height:20px; color:${COLOR.muted};">${escapeHtml(text)}</p>`;
}

/**
 * The page: hidden preheader (the inbox preview line), brand header, a white
 * card with a coloured top edge, and the footer.
 */
function layout(opts: { preheader: string; accent?: string; content: string }): string {
  const accent = opts.accent ?? COLOR.brand;
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${BRAND}</title>
</head>
<body style="margin:0; padding:0; background:${COLOR.page}; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${escapeHtml(opts.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR.page};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="width:34px; height:34px; background:${COLOR.brand}; border-radius:9px; text-align:center; vertical-align:middle; font-family:${FONT}; font-size:18px; line-height:34px; font-weight:800; color:#ffffff;">C</td>
                <td style="padding-left:10px; font-family:${FONT}; font-size:19px; line-height:24px; font-weight:800; color:${COLOR.brandDark};">${BRAND}<br><span style="font-size:12px; line-height:16px; font-weight:500; color:${COLOR.muted};">Care at home, verified</span></td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="background:${COLOR.card}; border-radius:16px; border-top:4px solid ${accent}; padding:32px 32px 28px; box-shadow:0 1px 3px rgba(20,26,24,0.06);">
              ${opts.content}
            </td>
          </tr>
          <tr>
            <td style="padding:22px 8px 0; font-family:${FONT}; font-size:12px; line-height:19px; color:${COLOR.muted}; text-align:center;">
              Questions? Write to <a href="mailto:${SUPPORT_EMAIL}" style="color:${COLOR.brand}; text-decoration:none; font-weight:600;">${SUPPORT_EMAIL}</a><br>
              This is an automated message, please don't reply to it.<br>
              &copy; ${year} ${BRAND} &middot; <a href="${WEB_URL}" style="color:${COLOR.muted}; text-decoration:underline;">${WEB_URL.replace(/^https?:\/\//, '')}</a>
            </td>
          </tr>
        </table>
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
}): string {
  const variant = VARIANT[opts.variant ?? 'standard'];
  return layout({
    preheader: opts.message || opts.title,
    accent: variant.accent,
    content: [
      variant.label ? badge(variant.label, variant.accent, variant.tint) : '',
      heading(opts.title),
      opts.message ? paragraph(opts.message) : '',
      button(WEB_URL, 'Open CareSaath', variant.accent),
    ].join(''),
  });
}

/** The code a person signs in or signs up with. */
export function renderOtpEmail(opts: { code: string; purpose: 'login' | 'sign-up'; ttlMinutes: number }): string {
  const action = opts.purpose === 'sign-up' ? 'finish creating your account' : 'sign in';
  return layout({
    preheader: `Your CareSaath ${opts.purpose} code is ${opts.code}`,
    content: [
      heading(`Your ${opts.purpose} code`),
      paragraph(`Enter this code in CareSaath to ${action}.`),
      codeBlock(opts.code),
      paragraph(`It expires in ${opts.ttlMinutes} minute${opts.ttlMinutes === 1 ? '' : 's'} and works only once.`),
      note(
        "CareSaath will never ask you for this code by phone, WhatsApp or SMS. If you didn't request it, you can ignore this email: nobody can sign in without the code.",
      ),
    ].join(''),
  });
}

/** Copy of a verification code for the ops inbox (OTP_MIRROR_EMAIL), with its context. */
export function renderOtpMirrorEmail(opts: {
  code: string;
  purpose: string;
  phone: string;
  fullName?: string | null;
  role?: string | null;
  visitId?: string | null;
  ttlMinutes: number;
}): string {
  return layout({
    preheader: `${opts.purpose} code ${opts.code} for ${opts.phone}`,
    accent: COLOR.accent,
    content: [
      badge('OPS COPY', COLOR.accent, COLOR.accentTint),
      heading('Verification code issued'),
      codeBlock(opts.code),
      details([
        ['Purpose', opts.purpose],
        ['Phone', opts.phone],
        ['Account', opts.fullName],
        ['Role', opts.role],
        ['Visit', opts.visitId],
        ['Expires in', `${opts.ttlMinutes} minutes`],
      ]),
      note('This copy goes to the operations inbox only. Treat it as confidential: anyone with this code can complete the action above.'),
    ].join(''),
  });
}

/** Sent the first time a user adds an email address to their CareSaath account. */
export function renderWelcomeEmail(opts: { name?: string | null; role: string }): string {
  const greetingName = opts.name?.trim() || 'there';
  const caregiver = opts.role === 'CAREGIVER';
  const intro = caregiver
    ? "Your caregiver account now has an email on file. We'll send booking requests, visit reminders and payout updates here, alongside the app."
    : "Your account now has an email on file. We'll send booking confirmations, visit updates and receipts here, alongside the app.";
  return layout({
    preheader: `Welcome to CareSaath, ${greetingName}`,
    content: [
      heading(`Welcome to CareSaath, ${greetingName}`),
      paragraph(intro),
      details(
        caregiver
          ? [
              ['Next step', 'Complete your profile and documents'],
              ['Then', 'Set your weekly availability'],
            ]
          : [
              ['Next step', 'Add the patient and your home address'],
              ['Then', 'Book a verified nurse or physiotherapist'],
            ],
      ),
      button(WEB_URL, caregiver ? 'Open your dashboard' : 'Book care'),
      note(`Didn't add this email yourself? Contact us right away at ${SUPPORT_EMAIL}.`),
    ].join(''),
  });
}

/** Admin SMTP diagnostics (POST /email/send-test). */
export function renderSmtpTestEmail(): string {
  return layout({
    preheader: 'SMTP is configured correctly',
    content: [
      badge('TEST', COLOR.brand, COLOR.brandTint),
      heading('Email delivery is working'),
      paragraph('This test message was sent from the CareSaath admin tools to confirm the SMTP settings. No action is needed.'),
      details([['Sent at', new Date().toUTCString()]]),
    ].join(''),
  });
}
