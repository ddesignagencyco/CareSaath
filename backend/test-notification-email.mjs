import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const { renderNotificationEmail, renderWelcomeEmail } = await import('./dist/email/templates.js');
const nodemailer = (await import('nodemailer')).default;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: parseInt(process.env.SMTP_PORT, 10) === 465,
  auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
});

const send = (subject, html) =>
  transporter.sendMail({
    from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
    to: process.env.SMTP_USERNAME,
    subject,
    html,
  });

console.log('🔍 Sending real notification-style emails through the new templates...\n');

const standard = renderNotificationEmail({
  title: 'Booking accepted',
  message: 'Your caregiver booking for tomorrow at 10:00 AM has been accepted.',
  variant: 'standard',
});
await send('✅ [Standard] Booking accepted', standard);
console.log('✅ Sent: standard notification template (booking.confirmed style)');

const admin = renderNotificationEmail({
  title: 'New payout request',
  message: 'A caregiver requested a payout of Rs 5,000.',
  variant: 'admin',
});
await send('🟠 [Admin Action] New payout request', admin);
console.log('✅ Sent: admin action-required template (payout.requested style)');

const critical = renderNotificationEmail({
  title: 'SOS alert',
  message: 'An SOS was raised during a CareSaath visit. Immediate attention required.',
  variant: 'critical',
});
await send('🔴 [Critical] SOS alert', critical);
console.log('✅ Sent: critical/urgent template (safety_incident.sos style)');

const welcome = renderWelcomeEmail({ name: 'Ayesha Khan', role: 'CUSTOMER' });
await send('🎉 Welcome to CareSaath', welcome);
console.log('✅ Sent: welcome email template\n');

console.log('📧 Check info@caresaath.com inbox for all 4 styled emails.');
process.exit(0);
