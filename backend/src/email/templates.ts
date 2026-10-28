const BRAND_NAME = 'CareSaath';
const BRAND_COLOR = '#2e7d32';

type Variant = 'standard' | 'admin' | 'critical';

const VARIANT_STYLE: Record<Variant, { accent: string; label: string | null }> = {
  standard: { accent: BRAND_COLOR, label: null },
  admin: { accent: '#e65100', label: 'ACTION REQUIRED' },
  critical: { accent: '#c62828', label: 'URGENT' },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function layout(accent: string, bodyHtml: string): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #222;">
      <div style="padding: 20px 24px; border-top: 4px solid ${accent};">
        <h2 style="margin: 0 0 4px; color: #1b1b1b;">${BRAND_NAME}</h2>
        ${bodyHtml}
      </div>
      <div style="padding: 16px 24px; margin-top: 12px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #888;">
        <p style="margin: 0;">This is an automated message from ${BRAND_NAME}. Please do not reply directly to this email.</p>
        <p style="margin: 4px 0 0;">&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.</p>
      </div>
    </div>
  `;
}

/** Generic templated email for any catalogue notification event. */
export function renderNotificationEmail(opts: {
  title: string;
  message?: string;
  variant?: Variant;
}): string {
  const variant = opts.variant ?? 'standard';
  const { accent, label } = VARIANT_STYLE[variant];
  const badge = label
    ? `<span style="display:inline-block; background:${accent}; color:#fff; font-size:11px; font-weight:700; letter-spacing:0.5px; padding:3px 8px; border-radius:3px; margin-bottom:10px;">${label}</span><br/>`
    : '';
  return layout(
    accent,
    `
      ${badge}
      <h3 style="margin: 4px 0 12px; color: #1b1b1b;">${escapeHtml(opts.title)}</h3>
      <p style="font-size: 14px; line-height: 1.6; color: #333;">${escapeHtml(opts.message ?? '')}</p>
    `,
  );
}

/** Sent the first time a user adds an email address to their CareSaath account. */
export function renderWelcomeEmail(opts: { name?: string | null; role: string }): string {
  const greetingName = opts.name?.trim() || 'there';
  const roleLabel = opts.role === 'CAREGIVER' ? 'caregiver' : 'customer';
  return layout(
    BRAND_COLOR,
    `
      <h3 style="margin: 4px 0 12px; color: #1b1b1b;">Welcome to CareSaath, ${escapeHtml(greetingName)}! 🎉</h3>
      <p style="font-size: 14px; line-height: 1.6; color: #333;">
        Thanks for adding your email to your CareSaath ${roleLabel} account. You'll now receive booking,
        payment and account updates here in addition to the app.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #333;">
        If this wasn't you, please contact us immediately at info@caresaath.com.
      </p>
    `,
  );
}
