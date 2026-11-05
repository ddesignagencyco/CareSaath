import { describe, expect, it } from 'vitest';
import {
  maskPhone,
  otpEmailSubject,
  otpMirrorSubject,
  renderNotificationEmail,
  renderOtpEmail,
  renderOtpMirrorEmail,
  renderSmtpTestEmail,
  renderWelcomeEmail,
  SUPPORT_EMAIL,
} from './templates.js';
import { LOGO_CID } from './logo.js';

/** The hidden inbox-preview line at the top of the body. */
const preview = (html: string) => /mso-hide:all;">([^&]*)/.exec(html)?.[1] ?? '';

describe('email templates', () => {
  it('render a full document with the site logo lockup and support footer', () => {
    for (const html of [
      renderNotificationEmail({ title: 'Booking confirmed' }),
      renderOtpEmail({ code: '123456', purpose: 'login', ttlMinutes: 5 }),
      renderWelcomeEmail({ name: 'Ayesha', role: 'CUSTOMER' }),
      renderSmtpTestEmail(),
    ]) {
      expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(html).toContain(`cid:${LOGO_CID}`);
      expect(html).toContain('Care<span');
      expect(html).toContain('HOME CARE');
      expect(html).toContain(SUPPORT_EMAIL);
    }
  });

  it('delivers the code in the body only: never in the subject or the inbox preview', () => {
    for (const purpose of ['login', 'sign-up'] as const) {
      const html = renderOtpEmail({ code: '482913', purpose, ttlMinutes: 5 });
      expect(html).toContain('482913');
      expect(preview(html)).not.toContain('482913');
      expect(otpEmailSubject(purpose)).not.toMatch(/\d{6}/);
    }
    expect(renderOtpEmail({ code: '1', purpose: 'sign-up', ttlMinutes: 1 })).toContain('expires in 1 minute and');
  });

  it('marks admin and critical notifications, and leaves standard ones plain', () => {
    expect(renderNotificationEmail({ title: 'x' })).not.toMatch(/Urgent|Action required/);
    expect(renderNotificationEmail({ title: 'x', variant: 'admin' })).toContain('Action required');
    expect(renderNotificationEmail({ title: 'x', variant: 'critical' })).toContain('Urgent');
  });

  it('escapes every dynamic value', () => {
    const attack = '<script>alert("x")</script>';
    for (const html of [
      renderNotificationEmail({ title: attack, message: attack }),
      renderWelcomeEmail({ name: attack, role: 'CUSTOMER' }),
      renderOtpMirrorEmail({ code: '1', purpose: 'LOGIN', phone: '+92', role: attack, visitId: attack, ttlMinutes: 5 }),
    ]) {
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    }
  });

  it('gives the ops copy the code but only a masked phone, and keeps both out of its subject', () => {
    const html = renderOtpMirrorEmail({ code: '654321', purpose: 'VISIT_CHECKIN', phone: '+923001112233', role: 'CUSTOMER', visitId: 'v-1', ttlMinutes: 5 });
    expect(html).toContain('654321');
    expect(html).toContain('•••• 2233');
    expect(html).not.toContain('3001112233');
    expect(otpMirrorSubject('VISIT_CHECKIN')).toBe('CareSaath ops · Visit check-in code issued');
    expect(maskPhone('12')).toBe('••••');
  });

  it('greets by first name and tailors the welcome to the role', () => {
    expect(renderWelcomeEmail({ name: 'Ayesha Khan', role: 'CUSTOMER' })).toContain('Welcome, Ayesha<');
    expect(renderWelcomeEmail({ name: '  ', role: 'CUSTOMER' })).toContain('Welcome to CareSaath<');
    expect(renderWelcomeEmail({ name: 'Ali', role: 'CAREGIVER' })).toContain('Open your dashboard');
    expect(renderWelcomeEmail({ name: 'Ali', role: 'CUSTOMER' })).toContain('Find care');
  });
});
