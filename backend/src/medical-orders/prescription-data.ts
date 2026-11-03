import type { PrescriptionPdfData } from './prescription-pdf.js';

const humanize = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/** Years elapsed since `dateOfBirth`, as shown on the prescription. */
function ageInYears(dateOfBirth: Date): number {
  const now = new Date();
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthsBeforeBirthday =
    now.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (now.getUTCMonth() === dateOfBirth.getUTCMonth() && now.getUTCDate() < dateOfBirth.getUTCDate());
  if (monthsBeforeBirthday) age -= 1;
  return age;
}

export interface MedicalOrderPrescriptionSource {
  id: string;
  createdAt: Date;
  diagnosis: string | null;
  medicines: unknown;
  labTests: unknown;
  visit: { scheduledDate: Date };
  doctor: {
    specialty: string;
    licenseBody: string;
    licenseNumber: string;
    pmdcExpiryDate: Date | null;
    pncExpiryDate: Date | null;
    user: { fullName: string };
  };
  patient: { name: string; dateOfBirth: Date | null; gender: string | null };
}

export function medicalOrderPrescriptionNumber(order: { id: string; createdAt: Date }): string {
  const year = order.createdAt.getUTCFullYear();
  return `CS-RX-${year}-${order.id.slice(0, 8).toUpperCase()}`;
}

/** medicines/labTests are stored as untyped JSON; this is the shape MedicalOrdersService writes. */
interface JsonMedicine {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}
interface JsonLabTest {
  name: string;
  instructions?: string;
}

export function medicalOrderPrescriptionDocument(order: MedicalOrderPrescriptionSource): PrescriptionPdfData {
  const { doctor } = order;
  const licenseExpiry = doctor.licenseBody === 'PMDC' ? doctor.pmdcExpiryDate : doctor.licenseBody === 'PNC' ? doctor.pncExpiryDate : null;
  return {
    prescriptionNumber: medicalOrderPrescriptionNumber(order),
    issuedAt: order.createdAt,
    doctorName: doctor.user.fullName || 'Doctor',
    doctorSpecialty: humanize(doctor.specialty),
    licenseBody: doctor.licenseBody,
    licenseNumber: doctor.licenseNumber,
    licenseExpiry,
    patientName: order.patient.name,
    patientAge: order.patient.dateOfBirth ? ageInYears(order.patient.dateOfBirth) : null,
    patientGender: order.patient.gender,
    visitDate: order.visit.scheduledDate,
    diagnosis: order.diagnosis,
    medicines: (order.medicines as JsonMedicine[] | null) ?? [],
    labTests: (order.labTests as JsonLabTest[] | null) ?? [],
  };
}
