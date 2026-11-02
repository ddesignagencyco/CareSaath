import PDFDocument from 'pdfkit';
import { formatDate, formatDateTime, pdfSafe } from '../receipts/receipt-pdf.js';

export interface PrescriptionMedicineLine {
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
}

export interface PrescriptionLabTestLine {
  name: string;
  instructions?: string | null;
}

/** Everything a prescription PDF shows, independent of how it is rendered. */
export interface PrescriptionPdfData {
  prescriptionNumber: string;
  issuedAt: Date;
  doctorName: string;
  /** Humanized, e.g. "Doctor". */
  doctorSpecialty: string;
  /** "PMDC" | "PNC" | "OTHER". */
  licenseBody: string;
  licenseNumber: string;
  licenseExpiry?: Date | null;
  patientName: string;
  patientAge?: number | null;
  patientGender?: string | null;
  visitDate: Date;
  diagnosis?: string | null;
  medicines: PrescriptionMedicineLine[];
  labTests: PrescriptionLabTestLine[];
}

const BRAND = '#0f766e';
const BRAND_DARK = '#123e3a';
const MARIGOLD = '#f5b544';
const MUTED = '#6b7280';
const INK = '#111827';
const LEFT = 50;
const RIGHT = 545;

/**
 * Draws the CareSaath mark (two people forming a heart in a rounded tile) at
 * (x, y), `size` points square. Mirrors frontend/src/shared/brand.tsx's
 * LogoMark so the PDF matches the product's own branding exactly.
 */
function drawLogoMark(pdf: PDFKit.PDFDocument, x: number, y: number, size: number, opacity = 1): void {
  const scale = size / 48;
  pdf.save();
  pdf.opacity(opacity);
  pdf.translate(x, y).scale(scale);
  pdf.roundedRect(0, 0, 48, 48, 14).fill(BRAND_DARK);
  pdf.lineWidth(3.6).lineCap('round').lineJoin('round');
  pdf
    .path('M24 38 C16.5 32.5 11 27.8 11 22.4 C11 18.6 13.8 16.2 17 16.2 C20 16.2 22.6 18 24 20.8')
    .stroke('white');
  pdf
    .path('M24 38 C31.5 32.5 37 27.8 37 22.4 C37 18.6 34.2 16.2 31 16.2 C28 16.2 25.4 18 24 20.8')
    .stroke(MARIGOLD);
  pdf.circle(17, 9.6, 3.3).fill('white');
  pdf.circle(31, 9.6, 3.3).fill(MARIGOLD);
  pdf.restore();
}

/** A large, pale, rotated logo mark centered on the page — the brand watermark. */
function drawWatermark(pdf: PDFKit.PDFDocument, pageWidth: number, pageHeight: number): void {
  const size = Math.min(pageWidth, pageHeight) * 0.68;
  pdf.save();
  pdf.rotate(-35, { origin: [pageWidth / 2, pageHeight / 2] });
  drawLogoMark(pdf, pageWidth / 2 - size / 2, pageHeight / 2 - size / 2, size, 0.045);
  pdf.restore();
}

/** Render a prescription to PDF bytes. Pass `compress: false` to inspect the text in tests. */
export function buildPrescriptionPdf(
  rx: PrescriptionPdfData,
  options: { compress?: boolean } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: LEFT,
      compress: options.compress ?? true,
      info: { Title: `Prescription ${rx.prescriptionNumber}`, Author: 'CareSaath' },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    // Fires once for the implicit first page and again on every pdf.addPage().
    pdf.on('pageAdded', () => drawWatermark(pdf, pdf.page.width, pdf.page.height));

    // Header
    drawLogoMark(pdf, LEFT, 42, 32);
    pdf.font('Helvetica-Bold').fontSize(20).fillColor(BRAND).text('CareSaath', LEFT + 42, 46);
    pdf.font('Helvetica').fontSize(9.5).fillColor(MUTED).text('Home nursing and physiotherapy', LEFT + 42, 68);
    pdf
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(INK)
      .text('Prescription', LEFT, 42, { width: RIGHT - LEFT, align: 'right' });
    pdf
      .font('Helvetica')
      .fontSize(10)
      .fillColor(MUTED)
      .text(`No. ${pdfSafe(rx.prescriptionNumber)}`, LEFT, 64, { width: RIGHT - LEFT, align: 'right' })
      .text(`Issued ${formatDateTime(rx.issuedAt)}`, LEFT, 78, { width: RIGHT - LEFT, align: 'right' });
    pdf.moveTo(LEFT, 100).lineTo(RIGHT, 100).strokeColor('#d1d5db').lineWidth(1).stroke();

    // Doctor panel
    const panelY = 114;
    pdf.roundedRect(LEFT, panelY, RIGHT - LEFT, 54, 8).fill('#ecfdf5');
    pdf
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(BRAND_DARK)
      .text(pdfSafe(`Dr. ${rx.doctorName}`), LEFT + 14, panelY + 10);
    pdf
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(pdfSafe(rx.doctorSpecialty), LEFT + 14, panelY + 29);
    const licenseLabel = rx.licenseBody === 'OTHER' ? 'Registration' : rx.licenseBody;
    const licenseLine = rx.licenseExpiry
      ? `${licenseLabel} No: ${rx.licenseNumber}  ·  Valid till ${formatDate(rx.licenseExpiry)}`
      : `${licenseLabel} No: ${rx.licenseNumber}`;
    pdf
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text(pdfSafe(licenseLine), LEFT + 14, panelY + 10, { width: RIGHT - LEFT - 28, align: 'right' });

    // Patient / visit line
    let y = panelY + 68;
    const patientBits = [
      `Patient: ${rx.patientName}`,
      ...(rx.patientAge != null ? [`Age: ${rx.patientAge}`] : []),
      ...(rx.patientGender ? [`Gender: ${rx.patientGender}`] : []),
      `Visit date: ${formatDate(rx.visitDate)}`,
    ];
    pdf.font('Helvetica').fontSize(10.5).fillColor(INK).text(pdfSafe(patientBits.join('   ·   ')), LEFT, y, { width: RIGHT - LEFT });
    y += pdf.heightOfString(pdfSafe(patientBits.join('   ·   ')), { width: RIGHT - LEFT }) + 18;

    const ensureRoom = (needed: number) => {
      if (y + needed > 760) {
        pdf.addPage();
        y = 50;
      }
    };

    const sectionHeading = (text: string) => {
      ensureRoom(26);
      pdf.font('Helvetica-Bold').fontSize(10).fillColor(BRAND).text(text.toUpperCase(), LEFT, y);
      y += 18;
    };

    if (rx.diagnosis) {
      sectionHeading('Diagnosis');
      const text = pdfSafe(rx.diagnosis);
      const height = pdf.heightOfString(text, { width: RIGHT - LEFT });
      ensureRoom(height + 16);
      pdf.font('Helvetica').fontSize(10.5).fillColor(INK).text(text, LEFT, y, { width: RIGHT - LEFT });
      y += height + 18;
    }

    if (rx.medicines.length > 0) {
      sectionHeading('Rx — Prescribed medicines');
      rx.medicines.forEach((m, i) => {
        const headline = [m.dosage, m.frequency, m.duration].filter(Boolean).join('  ·  ');
        const nameLine = pdfSafe(`${i + 1}. ${m.name}`);
        const nameHeight = pdf.heightOfString(nameLine, { width: RIGHT - LEFT - 10 });
        const headlineHeight = headline ? pdf.heightOfString(pdfSafe(headline), { width: RIGHT - LEFT - 20 }) : 0;
        const instrHeight = m.instructions ? pdf.heightOfString(pdfSafe(m.instructions), { width: RIGHT - LEFT - 20 }) : 0;
        ensureRoom(nameHeight + headlineHeight + instrHeight + 16);
        pdf.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(nameLine, LEFT, y, { width: RIGHT - LEFT - 10 });
        y += nameHeight + 2;
        if (headline) {
          pdf.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(pdfSafe(headline), LEFT + 14, y, { width: RIGHT - LEFT - 20 });
          y += headlineHeight + 2;
        }
        if (m.instructions) {
          pdf.font('Helvetica-Oblique').fontSize(9.5).fillColor(MUTED).text(pdfSafe(m.instructions), LEFT + 14, y, { width: RIGHT - LEFT - 20 });
          y += instrHeight + 2;
        }
        y += 8;
      });
      y += 6;
    }

    if (rx.labTests.length > 0) {
      sectionHeading('Lab tests');
      rx.labTests.forEach((lt, i) => {
        const nameLine = pdfSafe(`${i + 1}. ${lt.name}`);
        const nameHeight = pdf.heightOfString(nameLine, { width: RIGHT - LEFT - 10 });
        const instrHeight = lt.instructions ? pdf.heightOfString(pdfSafe(lt.instructions), { width: RIGHT - LEFT - 20 }) : 0;
        ensureRoom(nameHeight + instrHeight + 14);
        pdf.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(nameLine, LEFT, y, { width: RIGHT - LEFT - 10 });
        y += nameHeight + 2;
        if (lt.instructions) {
          pdf.font('Helvetica-Oblique').fontSize(9.5).fillColor(MUTED).text(pdfSafe(lt.instructions), LEFT + 14, y, { width: RIGHT - LEFT - 20 });
          y += instrHeight + 2;
        }
        y += 8;
      });
    }

    pdf
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(
        'This is a computer-generated prescription issued through CareSaath and does not require a signature.',
        LEFT,
        780,
        { width: RIGHT - LEFT, align: 'center' },
      );
    pdf.end();
  });
}
