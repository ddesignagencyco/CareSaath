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
    expect(html).not.toContain('Urgent');
    expect(html).not.toContain('Action required');
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
    expect(html).toContain('Action required');
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
    expect(html).toContain('Urgent');
  });

  it('propagates adapter failures so the notification is marked FAILED', async () => {
    const emailService = emailServiceMock();
    emailService.sendEmail.mockRejectedValue(new Error('smtp down'));
    const adapter = new EmailChannelAdapter(emailService as never);
    await expect(
      adapter.send({ event: 'booking.confirmed', email: 'customer@example.com', title: 'x' }),
    ).rejects.toThrow('smtp down');
  });

  it('enriches booking notifications with structured facts and targeted button', async () => {
    const emailService = emailServiceMock();
    const prismaMock = {
      booking: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'b-12345',
          serviceType: 'NURSING',
          rateSnapshot: 250000,
          discountAmount: 0,
          startDate: new Date('2026-11-25T10:00:00Z'),
          timeWindowStart: '09:00',
          timeWindowEnd: '13:00',
          patient: { name: 'Fatima Bibi', relationship: 'Mother' },
          caregiver: { user: { fullName: 'Nurse Sarah' } },
          customer: { fullName: 'Ali Khan' },
          address: { city: 'Lahore', area: 'Gulberg III' },
        }),
      },
    };
    const adapter = new EmailChannelAdapter(emailService as never, prismaMock as never);
    await adapter.send({
      event: 'booking.confirmed',
      email: 'ali@example.com',
      title: 'Booking accepted',
      message: 'Your caregiver accepted the booking.',
      payload: { bookingId: 'b-12345' },
      role: 'CUSTOMER' as never,
    });

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    const html = emailService.sendEmail.mock.calls[0][2] as string;
    expect(html).toContain('Nursing Care');
    expect(html).toContain('Fatima Bibi (Mother)');
    expect(html).toContain('Nurse Sarah');
    expect(html).toContain('Gulberg III, Lahore');
    expect(html).toContain('Rs 2,500');
    expect(html).toContain('View Booking Details');
    expect(html).toContain('/customer/bookings/b-12345');
    // Ensure raw ID is not displayed as text label
    expect(html).not.toMatch(/>\s*b-12345\s*</);
  });

  it('enriches visit notifications with visit status and tracking button', async () => {
    const emailService = emailServiceMock();
    const prismaMock = {
      visit: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'v-999',
          status: 'EN_ROUTE',
          scheduledDate: new Date('2026-11-25T10:00:00Z'),
          timeWindowStart: '10:00',
          timeWindowEnd: '14:00',
          booking: {
            serviceType: 'PHYSIOTHERAPY',
            patient: { name: 'Ahmed Khan' },
            caregiver: { user: { fullName: 'Dr. Zeeshan' } },
            customer: { fullName: 'Ali Khan' },
            address: { city: 'Karachi', area: 'Clifton' },
          },
        }),
      },
    };
    const adapter = new EmailChannelAdapter(emailService as never, prismaMock as never);
    await adapter.send({
      event: 'visit.en_route',
      email: 'ali@example.com',
      title: 'Caregiver is on the way',
      message: 'Your physiotherapist is heading to your address.',
      payload: { visitId: 'v-999' },
      role: 'CUSTOMER' as never,
    });

    const html = emailService.sendEmail.mock.calls[0][2] as string;
    expect(html).toContain('Physiotherapy');
    expect(html).toContain('En Route');
    expect(html).toContain('Ahmed Khan');
    expect(html).toContain('Dr. Zeeshan');
    expect(html).toContain('Track Visit Status');
    expect(html).toContain('/customer/visits/v-999');
  });
});
