import { describe, expect, it } from 'vitest';
import { medicalOrderPrescriptionDocument, medicalOrderPrescriptionNumber } from './prescription-data.js';
import type { MedicalOrderPrescriptionSource } from './prescription-data.js';
import { buildPrescriptionPdf } from './prescription-pdf.js';

function order(overrides: Partial<MedicalOrderPrescriptionSource> = {}): MedicalOrderPrescriptionSource {
  return {
    id: 'abcdef12-0000-4000-8000-000000000000',
    createdAt: new Date('2026-10-26T09:30:00.000Z'),
    diagnosis: 'Upper respiratory tract infection',
    medicines: [
      { name: 'Amoxicillin 500mg', dosage: '1 tablet', frequency: 'Twice daily', duration: '7 days', instructions: 'Take after meals' },
    ],
    labTests: [{ name: 'Complete Blood Count (CBC)', instructions: 'Fasting required' }],
    visit: { scheduledDate: new Date('2026-10-26T00:00:00.000Z') },
    doctor: {
      specialty: 'DOCTOR',
      licenseBody: 'PMDC',
      licenseNumber: 'PMDC-100001',
      pmdcExpiryDate: new Date('2027-06-30T00:00:00.000Z'),
      pncExpiryDate: null,
      user: { fullName: 'Ahsan Raza' },
    },
    patient: { name: 'Rukhsana Khan', dateOfBirth: new Date('1960-03-15T00:00:00.000Z'), gender: 'Female' },
    ...overrides,
  };
}

describe('medicalOrderPrescriptionDocument', () => {
  it('maps the doctor PMDC expiry when licenseBody is PMDC', () => {
    const doc = medicalOrderPrescriptionDocument(order());
    expect(doc.licenseExpiry).toEqual(new Date('2027-06-30T00:00:00.000Z'));
    expect(doc.doctorSpecialty).toBe('Doctor');
    expect(doc.patientAge).toBeGreaterThan(60);
  });

  it('maps the PNC expiry instead when licenseBody is PNC', () => {
    const doc = medicalOrderPrescriptionDocument(
      order({
        doctor: {
          specialty: 'NURSING',
          licenseBody: 'PNC',
          licenseNumber: 'PNC-100001',
          pmdcExpiryDate: null,
          pncExpiryDate: new Date('2027-01-01T00:00:00.000Z'),
          user: { fullName: 'Sana Iqbal' },
        },
      }),
    );
    expect(doc.licenseExpiry).toEqual(new Date('2027-01-01T00:00:00.000Z'));
  });

  it('numbers prescriptions distinctly from payment receipts', () => {
    expect(medicalOrderPrescriptionNumber({ id: '12345678-aaaa', createdAt: new Date('2026-10-24T00:00:00Z') })).toBe(
      'CS-RX-2026-12345678',
    );
  });
});

describe('buildPrescriptionPdf', () => {
  it('renders a real PDF containing the prescription text and watermark', async () => {
    const doc = medicalOrderPrescriptionDocument(order());
    const raw = await buildPrescriptionPdf(doc, { compress: false });
    expect(raw.subarray(0, 5).toString()).toBe('%PDF-');
    expect(raw.subarray(-6).toString()).toContain('%%EOF');
    const onPage = [...raw.toString('latin1').matchAll(/<([0-9a-f]+)>/gi)]
      .map((m) => Buffer.from(m[1]!, 'hex').toString('latin1'))
      .join('')
      .replace(/\s+/g, ' ');
    expect(onPage).toContain('CareSaath');
    expect(onPage).toContain('CS-RX-2026-ABCDEF12');
    expect(onPage).toContain('Ahsan Raza');
    expect(onPage).toContain('PMDC No: PMDC-100001');
    expect(onPage).toContain('Amoxicillin 500mg');
    expect(onPage).toContain('Complete Blood Count (CBC)');
    expect(onPage).toContain('Rukhsana Khan');
  });

  it('survives a long medicine list across a page break and non-Latin names', async () => {
    const doc = medicalOrderPrescriptionDocument(
      order({
        medicines: Array.from({ length: 40 }, (_, i) => ({
          name: `Medicine ${i}`,
          instructions: 'x'.repeat(80),
        })),
        patient: { name: 'عائشہ خان', dateOfBirth: null, gender: null },
      }),
    );
    const pdf = await buildPrescriptionPdf(doc);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
