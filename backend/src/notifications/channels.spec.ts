import { describe, expect, it, vi } from 'vitest';
import { EmailChannelAdapter } from './channels.js';

function emailServiceMock() {
  return { sendEmail: vi.fn().mockResolvedValue(undefined) };
}

describe('EmailChannelAdapter', () => {
  it('skips sending when the recipient has no email', async () => {
    const emailService = emailServiceMock();
    const adapter = new EmailChannelAdapter(emailService as never);
    await adapter.send({ event: 'booking.requested' });
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('sends a standard-styled email for a customer/caregiver event', async () => {
    const emailService = emailServiceMock();
    const adapter = new EmailChannelAdapter(emailService as never);
    await adapter.send({
      event: 'booking.confirmed',
      email: 'customer@example.com',
      title: 'Booking accepted',
      message: 'Your booking was accepted.',
    });
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'customer@example.com',
      'Booking accepted',
      expect.stringContaining('Your booking was accepted.'),
    );
    const html = emailService.sendEmail.mock.calls[0][2] as string;
    expect(html).not.toContain('URGENT');
    expect(html).not.toContain('ACTION REQUIRED');
  });

  it('sends an action-required styled email for an admin-only event', async () => {
    const emailService = emailServiceMock();
    const adapter = new EmailChannelAdapter(emailService as never);
    await adapter.send({
      event: 'payout.requested',
      email: 'admin@example.com',
      title: 'New payout request',
      message: 'A caregiver requested a payout.',
    });
    const html = emailService.sendEmail.mock.calls[0][2] as string;
    expect(html).toContain('ACTION REQUIRED');
  });

  it('sends a critical-styled email for an SOS event', async () => {
    const emailService = emailServiceMock();
    const adapter = new EmailChannelAdapter(emailService as never);
    await adapter.send({
      event: 'safety_incident.sos',
      email: 'admin@example.com',
      title: 'SOS alert',
      message: 'Emergency raised.',
    });
    const html = emailService.sendEmail.mock.calls[0][2] as string;
    expect(html).toContain('URGENT');
  });

  it('propagates adapter failures so the notification is marked FAILED', async () => {
    const emailService = emailServiceMock();
    emailService.sendEmail.mockRejectedValue(new Error('smtp down'));
    const adapter = new EmailChannelAdapter(emailService as never);
    await expect(
      adapter.send({ event: 'booking.confirmed', email: 'customer@example.com', title: 'x' }),
    ).rejects.toThrow('smtp down');
  });
});
