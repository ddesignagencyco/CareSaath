import { describe, expect, it } from 'vitest';
import {
  paymentReceiptDocument,
  paymentReceiptNumber,
  payoutReceiptDocument,
  payoutReceiptNumber,
} from './receipt-data.js';
import type { PaymentReceiptSource, PayoutReceiptSource } from './receipt-data.js';
import { buildReceiptPdf, formatMoney, pdfSafe } from './receipt-pdf.js';
import type { ReceiptDocument } from './receipt-pdf.js';

const paidAt = new Date('2026-10-26T09:30:00.000Z');

function payment(overrides: Partial<PaymentReceiptSource> = {}): PaymentReceiptSource {
  return {
    id: 'abcdef12-0000-4000-8000-000000000000',
    method: 'CASH',
    amount: 135000,
    commissionAmount: 27000,
    caregiverAmount: 108000,
    gatewayRef: null,
    paidAt,
    customerConfirmedAt: new Date('2026-10-26T09:28:00.000Z'),
    caregiverConfirmedAt: paidAt,
    visit: {
      scheduledDate: new Date('2026-10-26T00:00:00.000Z'),
      timeWindowStart: '09:00',
      timeWindowEnd: '11:00',
      booking: {
        rateSnapshot: 150000,
        discountAmount: 15000,
        serviceType: 'ELDERLY_CARE',
        patient: { name: 'Rukhsana Khan' },
        customer: { fullName: 'Ayesha Khan', phone: '+923001110001' },
        caregiver: { specialty: 'ELDERLY_CARE', user: { fullName: 'Sana Iqbal' } },
        promoCode: { code: 'WELCOME10' },
      },
    },
    ...overrides,
  };
}

const flatten = (doc: ReceiptDocument) =>
  doc.sections.flatMap((s) => s.lines.map((l) => `${l.label}: ${l.value}`)).join('\n');

describe('payment receipt content', () => {
  it('shows the customer what they paid, with the discount, and never the commission', () => {
    const doc = paymentReceiptDocument(payment(), 'customer');
    const text = flatten(doc);
    expect(doc.title).toBe('Payment receipt');
    expect(doc.total).toEqual({ label: 'Total paid', value: 'Rs 1,350.00' });
    expect(text).toContain('Visit fee: Rs 1,500.00');
    expect(text).toContain('Discount (WELCOME10): - Rs 150.00');
    expect(text).toContain('Caregiver: Sana Iqbal');
    expect(text).not.toMatch(/commission|earnings/i);
    expect(text).not.toContain('Ayesha Khan'); // the customer's own name is not repeated
  });

  it('gives the caregiver and admin the full breakdown', () => {
    for (const audience of ['caregiver', 'admin'] as const) {
      const text = flatten(paymentReceiptDocument(payment(), audience));
      expect(text).toContain('Platform commission: Rs 270.00');
      expect(text).toContain('Caregiver earnings: Rs 1,080.00');
      expect(text).toContain('Customer: Ayesha Khan');
    }
  });

  it('records both cash confirmations as proof the money changed hands', () => {
    const text = flatten(paymentReceiptDocument(payment(), 'customer'));
    expect(text).toContain('Customer confirmed handing over');
    expect(text).toContain('Caregiver confirmed receiving');
  });

  it('shows the gateway reference for card payments instead of cash confirmations', () => {
    const text = flatten(
      paymentReceiptDocument(
        payment({ method: 'CARD', gatewayRef: 'cs_test_123', customerConfirmedAt: null, caregiverConfirmedAt: null }),
        'customer',
      ),
    );
    expect(text).toContain('Gateway reference: cs_test_123');
    expect(text).not.toContain('confirmed');
  });

  it('omits the discount line when there was no discount', () => {
    const base = payment();
    const text = flatten(
      paymentReceiptDocument(
        { ...base, visit: { ...base.visit, booking: { ...base.visit.booking, discountAmount: 0, promoCode: null } } },
        'customer',
      ),
    );
    expect(text).not.toContain('Discount');
  });

  it('numbers receipts from the payment id and year', () => {
    expect(paymentReceiptNumber({ id: 'abcdef12-0000', paidAt })).toBe('CS-2026-ABCDEF12');
  });
});

describe('payout receipt content', () => {
  const payout = (overrides: Partial<PayoutReceiptSource> = {}): PayoutReceiptSource => ({
    id: '12345678-aaaa-4bbb-8ccc-000000000000',
    amount: 480000,
    status: 'PAID',
    requestedAt: new Date('2026-10-24T08:00:00.000Z'),
    transferredAt: new Date('2026-10-25T10:00:00.000Z'),
    transferReference: 'TXN-104455',
    caregiverConfirmedAt: new Date('2026-10-25T12:00:00.000Z'),
    caregiver: { user: { fullName: 'Fatima Noor', phone: '+923001110011' } },
    payoutAccount: { provider: 'JazzCash', accountTitle: 'Fatima Noor' },
    maskedAccountNumber: '****0000',
    ...overrides,
  });

  it('shows the masked account, reference and confirmation', () => {
    const doc = payoutReceiptDocument(payout(), 'caregiver');
    const text = flatten(doc);
    expect(doc.total).toEqual({ label: 'Amount transferred', value: 'Rs 4,800.00' });
    expect(text).toContain('Account number: ****0000');
    expect(text).toContain('Transfer reference: TXN-104455');
    expect(text).toContain('Receipt confirmed by the caregiver');
    expect(text).not.toContain('+923001110011'); // phone is for the admin copy only
    expect(flatten(payoutReceiptDocument(payout(), 'admin'))).toContain('+923001110011');
  });

  it('says it is awaiting confirmation until the caregiver confirms', () => {
    const text = flatten(
      payoutReceiptDocument(payout({ status: 'TRANSFERRED', caregiverConfirmedAt: null }), 'caregiver'),
    );
    expect(text).toContain('awaiting the caregiver');
    expect(text).not.toContain('Confirmed on');
  });

  it('numbers payout receipts separately from payment receipts', () => {
    expect(payoutReceiptNumber({ id: '12345678-aaaa', transferredAt: null, requestedAt: new Date('2026-10-24T00:00:00Z') })).toBe(
      'CS-PO-2026-12345678',
    );
  });
});

describe('buildReceiptPdf', () => {
  it('renders a real PDF containing the receipt text', async () => {
    const doc = paymentReceiptDocument(payment(), 'customer');
    const raw = await buildReceiptPdf(doc, { compress: false });
    expect(raw.subarray(0, 5).toString()).toBe('%PDF-');
    expect(raw.subarray(-6).toString()).toContain('%%EOF');
    // pdfkit writes page text as hex strings; decode them to read what is on the page.
    const onPage = [...raw.toString('latin1').matchAll(/<([0-9a-f]+)>/gi)]
      .map((m) => Buffer.from(m[1]!, 'hex').toString('latin1'))
      .join(' | ');
    expect(onPage).toContain('CareSaath');
    expect(onPage).toContain('CS-2026-ABCDEF12');
    expect(onPage).toContain('Rukhsana Khan');
    expect(onPage).toContain('Rs 1,350.00');
    expect(onPage).not.toMatch(/commission/i);
  });

  it('produces a compressed PDF by default and survives long content and non-Latin names', async () => {
    const doc = paymentReceiptDocument(payment(), 'admin');
    doc.sections.push({
      heading: 'Notes',
      lines: Array.from({ length: 80 }, (_, i) => ({ label: `Line ${i}`, value: `value ${'x'.repeat(40)}` })),
    });
    doc.sections[0]!.lines.push({ label: 'Urdu name', value: 'عائشہ خان' });
    const pdf = await buildReceiptPdf(doc);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('formats money and replaces characters the PDF fonts cannot draw', () => {
    expect(formatMoney(100)).toBe('Rs 1.00');
    expect(formatMoney(123456789)).toBe('Rs 1,234,567.89');
    expect(pdfSafe('Ayesha عائشہ')).toBe('Ayesha ?????');
    expect(pdfSafe('Café')).toBe('Café');
  });
});
