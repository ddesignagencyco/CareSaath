import { describe, expect, it } from 'vitest';
import {
  renderNotificationEmail,
  renderOtpEmail,
  renderOtpMirrorEmail,
  renderSmtpTestEmail,
  renderWelcomeEmail,
} from './templates.js';

describe('email templates', () => {
  it('render a complete HTML document with the brand and support footer', () => {
    for (const html of [
      renderNotificationEmail({ title: 'Booking confirmed' }),
      renderOtpEmail({ code: '123456', purpose: 'login', ttlMinutes: 5 }),
      renderWelcomeEmail({ name: 'Ayesha', role: 'CUSTOMER' }),
      renderSmtpTestEmail(),
    ]) {
      expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(html).toContain('CareSaath');
      expect(html).toContain('info@caresaath.com');
    }
  });

  it('puts the code in the OTP email and its inbox preview, with the right wording per purpose', () => {
    const login = renderOtpEmail({ code: '482913', purpose: 'login', ttlMinutes: 5 });
    expect(login).toContain('482913');
    expect(login).toContain('Your CareSaath login code is 482913');
    expect(login).toContain('to sign in');
    expect(login).toContain('5 minutes');

    const signup = renderOtpEmail({ code: '111222', purpose: 'sign-up', ttlMinutes: 1 });
    expect(signup).toContain('finish creating your account');
    expect(signup).toContain('1 minute and');
  });

  it('labels admin and critical notifications, and leaves standard ones unlabelled', () => {
    expect(renderNotificationEmail({ title: 'x' })).not.toMatch(/URGENT|ACTION REQUIRED/);
    expect(renderNotificationEmail({ title: 'x', variant: 'admin' })).toContain('ACTION REQUIRED');
    expect(renderNotificationEmail({ title: 'x', variant: 'critical' })).toContain('URGENT');
  });

  it('escapes every user-supplied value', () => {
    const attack = '<script>alert("x")</script>';
    const outputs = [
      renderNotificationEmail({ title: attack, message: attack }),
      renderWelcomeEmail({ name: attack, role: 'CUSTOMER' }),
      renderOtpMirrorEmail({ code: '1', purpose: 'LOGIN', phone: '+92', fullName: attack, role: attack, ttlMinutes: 5 }),
    ];
    for (const html of outputs) {
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    }
  });

  it('lists only the context the ops copy actually has', () => {
    const html = renderOtpMirrorEmail({ code: '654321', purpose: 'VISIT_CHECKIN', phone: '+923001112233', visitId: 'v-1', ttlMinutes: 5 });
    expect(html).toContain('654321');
    expect(html).toContain('+923001112233');
    expect(html).toContain('v-1');
    expect(html).not.toContain('>Account<');
  });

  it('greets a nameless user and tailors the welcome to the role', () => {
    expect(renderWelcomeEmail({ name: '  ', role: 'CUSTOMER' })).toContain('Welcome to CareSaath, there');
    expect(renderWelcomeEmail({ name: 'Ali', role: 'CAREGIVER' })).toContain('Open your dashboard');
    expect(renderWelcomeEmail({ name: 'Ali', role: 'CUSTOMER' })).toContain('Book care');
  });
});
