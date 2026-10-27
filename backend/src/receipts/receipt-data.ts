import { formatDate, formatDateTime, formatMoney } from './receipt-pdf.js';
import type { ReceiptDocument } from './receipt-pdf.js';

/** Who the copy is for: customers never see the platform commission; caregivers and admins do. */
export type ReceiptAudience = 'customer' | 'caregiver' | 'admin';

const humanize = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export interface PaymentReceiptSource {
  id: string;
  method: string;
  amount: number;
  commissionAmount: number;
  caregiverAmount: number;
  gatewayRef: string | null;
  paidAt: Date | null;
  customerConfirmedAt: Date | null;
  caregiverConfirmedAt: Date | null;
  visit: {
    scheduledDate: Date;
    timeWindowStart: string;
    timeWindowEnd: string;
    booking: {
      rateSnapshot: number;
      discountAmount: number;
      serviceType: string;
      patient: { name: string };
      customer: { fullName: string; phone: string };
      caregiver: { specialty: string; user: { fullName: string } };
      promoCode: { code: string } | null;
    };
  };
}

export function paymentReceiptNumber(payment: { id: string; paidAt: Date | null }): string {
  const year = (payment.paidAt ?? new Date()).getUTCFullYear();
  return `CS-${year}-${payment.id.slice(0, 8).toUpperCase()}`;
}

export function paymentReceiptDocument(
  payment: PaymentReceiptSource,
  audience: ReceiptAudience,
): ReceiptDocument {
  const { visit } = payment;
  const { booking } = visit;
  const sections: ReceiptDocument['sections'] = [
    {
      heading: 'Visit',
      lines: [
        { label: 'Service', value: humanize(booking.serviceType) },
        { label: 'Date', value: formatDate(visit.scheduledDate) },
        { label: 'Time window', value: `${visit.timeWindowStart} - ${visit.timeWindowEnd}` },
        { label: 'Patient', value: booking.patient.name },
        { label: 'Caregiver', value: booking.caregiver.user.fullName || 'Caregiver' },
        ...(audience !== 'customer'
          ? [{ label: 'Customer', value: booking.customer.fullName || booking.customer.phone }]
          : []),
      ],
    },
    {
      heading: 'Charges',
      lines: [
        { label: 'Visit fee', value: formatMoney(booking.rateSnapshot) },
        ...(booking.discountAmount > 0
          ? [
              {
                label: booking.promoCode ? `Discount (${booking.promoCode.code})` : 'Discount',
                value: `- ${formatMoney(booking.discountAmount)}`,
              },
            ]
          : []),
        ...(audience !== 'customer'
          ? [
              { label: 'Platform commission', value: formatMoney(payment.commissionAmount) },
              { label: 'Caregiver earnings', value: formatMoney(payment.caregiverAmount) },
            ]
          : []),
      ],
    },
    {
      heading: 'Payment',
      lines: [
        { label: 'Method', value: humanize(payment.method) },
        { label: 'Status', value: 'Paid and verified' },
        ...(payment.paidAt ? [{ label: 'Paid on', value: formatDateTime(payment.paidAt) }] : []),
        ...(payment.method === 'CASH'
          ? [
              ...(payment.customerConfirmedAt
                ? [{ label: 'Customer confirmed handing over', value: formatDateTime(payment.customerConfirmedAt) }]
                : []),
              ...(payment.caregiverConfirmedAt
                ? [{ label: 'Caregiver confirmed receiving', value: formatDateTime(payment.caregiverConfirmedAt) }]
                : []),
            ]
          : payment.gatewayRef
            ? [{ label: 'Gateway reference', value: payment.gatewayRef }]
            : []),
      ],
    },
  ];
  return {
    title: audience === 'customer' ? 'Payment receipt' : 'Payment record',
    receiptNumber: paymentReceiptNumber(payment),
    issuedAt: payment.paidAt ?? new Date(),
    sections,
    total: { label: 'Total paid', value: formatMoney(payment.amount) },
  };
}

export interface PayoutReceiptSource {
  id: string;
  amount: number;
  status: string;
  requestedAt: Date;
  transferredAt: Date | null;
  transferReference: string | null;
  caregiverConfirmedAt: Date | null;
  caregiver: { user: { fullName: string; phone: string } };
  payoutAccount: { provider: string; accountTitle: string };
  /** Already decrypted and masked by the caller; the raw number never reaches a receipt. */
  maskedAccountNumber: string;
}

export function payoutReceiptNumber(payout: { id: string; transferredAt: Date | null; requestedAt: Date }): string {
  const year = (payout.transferredAt ?? payout.requestedAt).getUTCFullYear();
  return `CS-PO-${year}-${payout.id.slice(0, 8).toUpperCase()}`;
}

export function payoutReceiptDocument(
  payout: PayoutReceiptSource,
  audience: ReceiptAudience,
): ReceiptDocument {
  const confirmed = payout.status === 'PAID' && payout.caregiverConfirmedAt;
  return {
    title: 'Transfer receipt',
    receiptNumber: payoutReceiptNumber(payout),
    issuedAt: payout.transferredAt ?? payout.requestedAt,
    sections: [
      {
        heading: 'Transfer',
        lines: [
          { label: 'Paid to', value: payout.caregiver.user.fullName || 'Caregiver' },
          ...(audience === 'admin' ? [{ label: 'Phone', value: payout.caregiver.user.phone }] : []),
          { label: 'Account', value: `${payout.payoutAccount.provider} - ${payout.payoutAccount.accountTitle}` },
          { label: 'Account number', value: payout.maskedAccountNumber },
          { label: 'Requested on', value: formatDateTime(payout.requestedAt) },
          ...(payout.transferredAt ? [{ label: 'Sent on', value: formatDateTime(payout.transferredAt) }] : []),
          ...(payout.transferReference ? [{ label: 'Transfer reference', value: payout.transferReference }] : []),
        ],
      },
      {
        heading: 'Confirmation',
        lines: [
          {
            label: 'Status',
            value: confirmed ? 'Receipt confirmed by the caregiver' : 'Sent, awaiting the caregiver\'s confirmation',
          },
          ...(payout.caregiverConfirmedAt
            ? [{ label: 'Confirmed on', value: formatDateTime(payout.caregiverConfirmedAt) }]
            : []),
        ],
      },
    ],
    total: { label: 'Amount transferred', value: formatMoney(payout.amount) },
  };
}
