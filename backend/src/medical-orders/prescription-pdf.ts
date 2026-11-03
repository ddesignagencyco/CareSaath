import PDFDocument from 'pdfkit';
import { formatDate, pdfSafe } from '../receipts/receipt-pdf.js';

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

const NAVY = '#123a5e';
const NAVY_DEEP = '#0e2f4d';
const TEAL = '#0f766e';
const GOLD = '#f5b544';
const INK = '#1f2937';
const MUTED = '#6b7280';
const PATIENT_BG = '#eaf2f9';
const PATIENT_BORDER = '#d4e3f0';
const CARD_BG = '#f7fafc';
const CARD_BORDER = '#e4ebf1';
const RULE = '#d7dee6';

const PAGE_H = 841.89;
const LEFT = 36;
const RIGHT = 559;
const CW = RIGHT - LEFT;

const LEFT_CARD_W = 196;
const RIGHT_X = LEFT + LEFT_CARD_W + 16;
const RIGHT_W = RIGHT - RIGHT_X;
const BODY_TOP = 176;
const BODY_BOTTOM = 710; // content stops above the wave footer
const LEFT_CARD_BOTTOM = 715;

/* ----------------------------- small vector icons ------------------------- */
function iconPerson(pdf: PDFKit.PDFDocument, x: number, y: number, s: number, c: string): void {
  pdf.save();
  pdf.circle(x + s * 0.5, y + s * 0.3, s * 0.16).fill(c);
  pdf
    .path(`M ${x + s * 0.18} ${y + s * 0.84} C ${x + s * 0.18} ${y + s * 0.52}, ${x + s * 0.82} ${y + s * 0.52}, ${x + s * 0.82} ${y + s * 0.84} Z`)
    .fill(c);
  pdf.restore();
}
function iconCalendar(pdf: PDFKit.PDFDocument, x: number, y: number, s: number, c: string): void {
  pdf.save();
  pdf.lineWidth(1.3).strokeColor(c);
  pdf.roundedRect(x + s * 0.12, y + s * 0.2, s * 0.76, s * 0.68, 2).stroke();
  pdf.moveTo(x + s * 0.12, y + s * 0.38).lineTo(x + s * 0.88, y + s * 0.38).stroke();
  pdf.moveTo(x + s * 0.32, y + s * 0.12).lineTo(x + s * 0.32, y + s * 0.26).stroke();
  pdf.moveTo(x + s * 0.68, y + s * 0.12).lineTo(x + s * 0.68, y + s * 0.26).stroke();
  pdf.restore();
}
function iconClipboard(pdf: PDFKit.PDFDocument, x: number, y: number, s: number, c: string): void {
  pdf.save();
  pdf.lineWidth(1.3).strokeColor(c);
  pdf.roundedRect(x + s * 0.18, y + s * 0.16, s * 0.64, s * 0.74, 2).stroke();
  pdf.roundedRect(x + s * 0.36, y + s * 0.08, s * 0.28, s * 0.14, 1.5).fillAndStroke(c, c);
  pdf.restore();
}
function iconBulb(pdf: PDFKit.PDFDocument, x: number, y: number, s: number, c: string): void {
  pdf.save();
  pdf.lineWidth(1.3).strokeColor(c);
  pdf.circle(x + s * 0.5, y + s * 0.4, s * 0.26).stroke();
  pdf.moveTo(x + s * 0.38, y + s * 0.78).lineTo(x + s * 0.62, y + s * 0.78).stroke();
  pdf.moveTo(x + s * 0.4, y + s * 0.88).lineTo(x + s * 0.6, y + s * 0.88).stroke();
  pdf.restore();
}
function iconFlask(pdf: PDFKit.PDFDocument, x: number, y: number, s: number, c: string): void {
  pdf.save();
  pdf.lineWidth(1.3).lineJoin('round').strokeColor(c);
  pdf
    .path(`M ${x + s * 0.4} ${y + s * 0.16} L ${x + s * 0.4} ${y + s * 0.46} L ${x + s * 0.2} ${y + s * 0.84} L ${x + s * 0.8} ${y + s * 0.84} L ${x + s * 0.6} ${y + s * 0.46} L ${x + s * 0.6} ${y + s * 0.16}`)
    .stroke();
  pdf.moveTo(x + s * 0.34, y + s * 0.16).lineTo(x + s * 0.66, y + s * 0.16).stroke();
  pdf.restore();
}
function iconPill(pdf: PDFKit.PDFDocument, x: number, y: number, s: number, c: string): void {
  pdf.save();
  pdf.lineWidth(1.2).strokeColor(c);
  pdf.roundedRect(x + s * 0.12, y + s * 0.36, s * 0.76, s * 0.26, s * 0.13).stroke();
  pdf.moveTo(x + s * 0.5, y + s * 0.36).lineTo(x + s * 0.5, y + s * 0.62).stroke();
  pdf.restore();
}
function iconGlass(pdf: PDFKit.PDFDocument, x: number, y: number, s: number, c: string): void {
  pdf.save();
  pdf.lineWidth(1.2).lineJoin('round').strokeColor(c);
  pdf
    .path(`M ${x + s * 0.3} ${y + s * 0.22} L ${x + s * 0.7} ${y + s * 0.22} L ${x + s * 0.64} ${y + s * 0.82} L ${x + s * 0.36} ${y + s * 0.82} Z`)
    .stroke();
  pdf.moveTo(x + s * 0.33, y + s * 0.4).lineTo(x + s * 0.67, y + s * 0.4).stroke();
  pdf.restore();
}

/** CareSaath heart logo (teal + gold interlocking hearts). */
function drawHeart(pdf: PDFKit.PDFDocument, x: number, y: number, size: number, opacity = 1): void {
  const scale = size / 48;
  pdf.save();
  pdf.opacity(opacity);
  pdf.translate(x, y).scale(scale);
  pdf.lineWidth(4).lineCap('round').lineJoin('round');
  pdf.path('M24 38 C16.5 32.5 11 27.8 11 22.4 C11 18.6 13.8 16.2 17 16.2 C20 16.2 22.6 18 24 20.8').stroke(TEAL);
  pdf.path('M24 38 C31.5 32.5 37 27.8 37 22.4 C37 18.6 34.2 16.2 31 16.2 C28 16.2 25.4 18 24 20.8').stroke(GOLD);
  pdf.circle(17, 9.6, 3.3).fill(TEAL);
  pdf.circle(31, 9.6, 3.3).fill(GOLD);
  pdf.restore();
}

/** Faint heart-with-pulse watermark for the notes column. */
function drawPulseWatermark(pdf: PDFKit.PDFDocument, cx: number, cy: number, w: number): void {
  pdf.save();
  pdf.opacity(0.06);
  const s = w / 48;
  pdf.translate(cx - w / 2, cy - w / 2).scale(s);
  pdf.path('M24 42 C10 32 4 25 4 16.5 C4 10 9 6 15 6 C19 6 22.5 8.4 24 11.8 C25.5 8.4 29 6 33 6 C39 6 44 10 44 16.5 C44 25 38 32 24 42 Z').fill(TEAL);
  pdf.restore();
}

/** Layered teal/gold/navy wave band across the foot of the page. */
function drawWaveFooter(pdf: PDFKit.PDFDocument, w: number, h: number): void {
  const band = (yBase: number, amp: number, color: string) => {
    pdf.save();
    pdf.moveTo(0, yBase);
    pdf.bezierCurveTo(w * 0.28, yBase - amp, w * 0.5, yBase + amp, w * 0.72, yBase);
    pdf.bezierCurveTo(w * 0.88, yBase - amp * 0.7, w, yBase + amp * 0.5, w, yBase - 2);
    pdf.lineTo(w, h).lineTo(0, h).fill(color);
    pdf.restore();
  };
  band(h - 66, 16, TEAL);
  band(h - 52, 18, GOLD);
  band(h - 38, 15, NAVY);
}

/** Right-aligned "Name (Designation)" — big name + small parenthetical role. */
function drawRightNameDes(pdf: PDFKit.PDFDocument, rightEdge: number, name: string, des: string, y: number, big: number, small: number): void {
  // The role is shown as "(Doctor)", so drop any leading "Dr." already in the name.
  const nameTxt = pdfSafe(name.replace(/^\s*dr\.?\s+/i, ''));
  const desTxt = `  (${pdfSafe(des)})`;
  pdf.font('Helvetica-Bold').fontSize(big);
  const nameW = pdf.widthOfString(nameTxt);
  pdf.font('Helvetica-Bold').fontSize(small);
  const desW = pdf.widthOfString(desTxt);
  const startX = rightEdge - nameW - desW;
  pdf.font('Helvetica-Bold').fontSize(big).fillColor(NAVY).text(nameTxt, startX, y, { lineBreak: false });
  pdf.font('Helvetica-Bold').fontSize(small).fillColor(TEAL).text(desTxt, startX + nameW, y + (big - small) * 0.68, { lineBreak: false });
}

/** The ℞ mark. */
function drawRxMark(pdf: PDFKit.PDFDocument, x: number, y: number, color: string, big = 22): void {
  pdf.font('Helvetica-Bold').fontSize(big).fillColor(color).text('R', x, y, { lineBreak: false });
  const rWidth = pdf.widthOfString('R');
  pdf.font('Helvetica-Bold').fontSize(big * 0.58).fillColor(color).text('x', x + rWidth - big * 0.14, y + big * 0.5, { lineBreak: false });
}

const ADVICE = ['Take medicines exactly as prescribed', 'Complete the full course', 'Keep hydrated and rest well', 'Return if symptoms persist or worsen'];

/** Render a prescription to PDF bytes. Pass `compress: false` to inspect the text in tests. */
export function buildPrescriptionPdf(
  rx: PrescriptionPdfData,
  options: { compress?: boolean } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      // bottom margin 0 so the wave footer (below the text margin) never triggers
      // PDFKit auto-pagination; body pagination is manual via ensureRoom().
      margins: { top: LEFT, left: LEFT, right: LEFT, bottom: 0 },
      compress: options.compress ?? true,
      info: { Title: `Prescription ${rx.prescriptionNumber}`, Author: 'CareSaath' },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    // Wave footer is the only fixed furniture on every page. pageAdded does NOT
    // fire for the implicit first page, so paint page 1 by hand.
    const paintFooter = () => drawWaveFooter(pdf, pdf.page.width, pdf.page.height);
    pdf.on('pageAdded', paintFooter);
    paintFooter();

    const licenseLabel = rx.licenseBody === 'OTHER' ? 'Reg' : rx.licenseBody;

    /* ---------------------------- header --------------------------------- */
    const lic = rx.licenseExpiry
      ? `${licenseLabel} No: ${rx.licenseNumber}   |   Valid till ${formatDate(rx.licenseExpiry)}`
      : `${licenseLabel} No: ${rx.licenseNumber}`;
    // The full letterhead header; repeated at the top of every page so
    // continuation pages are never bare.
    const drawHeader = () => {
      const bx = LEFT + 70;
      drawHeart(pdf, LEFT, 30, 48);
      pdf.moveTo(LEFT + 58, 33).lineTo(LEFT + 58, 81).strokeColor(RULE).lineWidth(1).stroke();
      pdf.font('Helvetica-Bold').fontSize(25).fillColor(NAVY).text('CareSaath', bx, 30);
      pdf.font('Helvetica').fontSize(10.5).fillColor(TEAL).text('Home Nursing & Physiotherapy', bx, 56);
      pdf.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED).text('Licensed caregivers across Pakistan', bx, 69);
      pdf
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(pdfSafe(`Rx No. ${rx.prescriptionNumber}   ·   Issued ${formatDate(rx.issuedAt)}`), bx, 81);
      drawRightNameDes(pdf, RIGHT, rx.doctorName, rx.doctorSpecialty, 32, 20, 11);
      pdf.font('Helvetica').fontSize(9).fillColor(INK).text(pdfSafe(lic), RIGHT - 320, 57, { width: 320, align: 'right' });
      pdf.moveTo(LEFT, 100).lineTo(RIGHT, 100).strokeColor(RULE).lineWidth(1).stroke();
    };
    drawHeader();

    /* ------------------------- patient bar ------------------------------- */
    const pbY = 114;
    const pbH = 46;
    pdf.roundedRect(LEFT, pbY, CW, pbH, 10).fillAndStroke(PATIENT_BG, PATIENT_BORDER);
    const cellW = CW / 3;
    const cell = (idx: number, icon: (p: PDFKit.PDFDocument, x: number, y: number, s: number, c: string) => void, label: string, value: string) => {
      const cxs = LEFT + idx * cellW + 16;
      icon(pdf, cxs, pbY + 13, 20, TEAL);
      const tx = cxs + 28;
      pdf.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), tx, pbY + 11, { characterSpacing: 0.4 });
      pdf.font('Helvetica-Bold').fontSize(11.5).fillColor(NAVY).text(pdfSafe(value), tx, pbY + 23, { width: cellW - 44, lineBreak: false, ellipsis: true });
      if (idx > 0) pdf.moveTo(LEFT + idx * cellW, pbY + 9).lineTo(LEFT + idx * cellW, pbY + pbH - 9).strokeColor(PATIENT_BORDER).lineWidth(1).stroke();
    };
    const gender = rx.patientGender ? rx.patientGender.charAt(0).toUpperCase() + rx.patientGender.slice(1) : null;
    const ageSex = [rx.patientAge != null ? `${rx.patientAge} yrs` : null, gender].filter(Boolean).join('  ·  ') || '—';
    cell(0, iconPerson, 'Patient', rx.patientName);
    cell(1, iconCalendar, 'Age / Sex', ageSex);
    cell(2, iconCalendar, 'Visit Date', formatDate(rx.visitDate));

    /* ------------------------- left notes card --------------------------- */
    pdf.roundedRect(LEFT, BODY_TOP, LEFT_CARD_W, LEFT_CARD_BOTTOM - BODY_TOP, 10).fillAndStroke('#ffffff', CARD_BORDER);
    // navy header bar
    pdf.save();
    pdf.roundedRect(LEFT, BODY_TOP, LEFT_CARD_W, 30, 10).fill(NAVY);
    pdf.rect(LEFT, BODY_TOP + 16, LEFT_CARD_W, 14).fill(NAVY);
    pdf.restore();
    iconClipboard(pdf, LEFT + 12, BODY_TOP + 8, 16, '#ffffff');
    pdf.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff').text('Clinical Notes', LEFT + 34, BODY_TOP + 9);

    drawPulseWatermark(pdf, LEFT + LEFT_CARD_W / 2, BODY_TOP + 200, 120);

    let yl = BODY_TOP + 42;
    const lx = LEFT + 14;
    const lw = LEFT_CARD_W - 28;
    pdf.font('Helvetica-Bold').fontSize(11).fillColor(TEAL).text('Diagnosis', lx, yl);
    yl += 15;
    pdf.moveTo(lx, yl).lineTo(lx + 40, yl).strokeColor(GOLD).lineWidth(1.5).stroke();
    yl += 8;
    pdf.font('Helvetica').fontSize(10).fillColor(INK).text(rx.diagnosis ? pdfSafe(rx.diagnosis) : '—', lx, yl, { width: lw, lineGap: 2 });
    yl += (rx.diagnosis ? pdf.heightOfString(pdfSafe(rx.diagnosis), { width: lw, lineGap: 2 }) : 12) + 22;

    pdf.font('Helvetica-Bold').fontSize(11).fillColor(TEAL).text('General Advice', lx + 16, yl);
    iconBulb(pdf, lx, yl - 1, 14, GOLD);
    yl += 15;
    pdf.moveTo(lx, yl).lineTo(lx + 40, yl).strokeColor(GOLD).lineWidth(1.5).stroke();
    yl += 8;
    ADVICE.forEach((a) => {
      pdf.circle(lx + 3, yl + 4.5, 1.8).fill(TEAL);
      pdf.font('Helvetica').fontSize(9.5).fillColor(INK).text(a, lx + 12, yl, { width: lw - 12, lineGap: 1 });
      yl += pdf.heightOfString(a, { width: lw - 12, lineGap: 1 }) + 6;
    });

    /* ------------------------- right Rx column --------------------------- */
    let colX = RIGHT_X;
    let colW = RIGHT_W;
    let y = BODY_TOP;

    const rxHeader = () => {
      // navy ℞ ribbon with a folded right end.
      const rw = 52;
      pdf.save();
      pdf.path(`M ${colX} ${y} L ${colX + rw} ${y} L ${colX + rw + 11} ${y + 15} L ${colX + rw} ${y + 30} L ${colX} ${y + 30} Z`).fill(NAVY);
      pdf.restore();
      drawRxMark(pdf, colX + 12, y + 3, '#ffffff', 20);
      pdf.moveTo(colX + rw + 26, y + 15).lineTo(colX + colW, y + 15).strokeColor(RULE).lineWidth(1).stroke();
      y += 40;
    };

    // Continuation pages: repeat the header, then flow full width below it.
    const CONT_TOP = 112;
    const ensureRoom = (needed: number): boolean => {
      if (y + needed > BODY_BOTTOM) {
        pdf.addPage();
        drawHeader();
        colX = LEFT;
        colW = CW;
        y = CONT_TOP;
        return true;
      }
      return false;
    };

    rxHeader();

    rx.medicines.forEach((m, i) => {
      const nameH = 14;
      const doseLine = [m.dosage, m.frequency, m.duration].map((s) => (s ? pdfSafe(s) : '')).filter(Boolean).join('    ·    ');
      pdf.font('Helvetica').fontSize(9.5);
      const doseH = doseLine ? pdf.heightOfString(doseLine, { width: colW - 76 }) : 0;
      const instr = m.instructions ? pdfSafe(m.instructions) : '';
      pdf.font('Helvetica-Oblique').fontSize(9);
      const instrH = instr ? pdf.heightOfString(instr, { width: colW - 76 }) : 0;
      const cardH = 14 + nameH + (doseLine ? doseH + 5 : 0) + (instr ? instrH + 4 : 0);
      if (ensureRoom(cardH + 10)) rxHeader();

      pdf.roundedRect(colX, y, colW, cardH, 8).fillAndStroke(CARD_BG, CARD_BORDER);
      const padX = colX + 40;
      const contentW = colX + colW - padX - 14;
      // numbered circle
      pdf.circle(colX + 22, y + 18, 10).lineWidth(1.3).fillAndStroke('#ffffff', TEAL);
      pdf.font('Helvetica-Bold').fontSize(9.5).fillColor(TEAL).text(`${i + 1}`, colX + 14, y + 13.5, { width: 16, align: 'center' });

      let yc = y + 11;
      pdf.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text(pdfSafe(m.name), padX, yc, { width: contentW });
      yc += nameH + 2;
      if (doseLine) {
        iconPill(pdf, padX - 1, yc - 1, 13, TEAL);
        pdf.font('Helvetica').fontSize(9.5).fillColor(INK).text(doseLine, padX + 18, yc, { width: contentW - 18 });
        yc += doseH + 4;
      }
      if (instr) {
        iconGlass(pdf, padX - 1, yc - 1, 13, GOLD);
        pdf.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(instr, padX + 18, yc, { width: contentW - 18 });
        yc += instrH + 3;
      }
      y += cardH + 10;
    });

    if (rx.medicines.length === 0) {
      pdf.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED).text('No medicines prescribed.', colX, y);
      y += 18;
    }

    if (rx.labTests.length > 0) {
      // Keep the heading with its first item or two (no orphaned heading).
      ensureRoom(100);
      y += 8;
      const labHeader = () => {
        iconFlask(pdf, colX, y - 2, 16, TEAL);
        pdf.font('Helvetica-Bold').fontSize(12).fillColor(TEAL).text('INVESTIGATIONS / LAB TESTS', colX + 22, y + 1, { characterSpacing: 1.5 });
        y += 20;
        pdf.moveTo(colX, y).lineTo(colX + colW, y).strokeColor(RULE).lineWidth(1).stroke();
        y += 10;
      };
      labHeader();
      rx.labTests.forEach((lt, i) => {
        const nameLine = pdfSafe(`${i + 1}.   ${lt.name}`);
        const instr = lt.instructions ? pdfSafe(lt.instructions) : '';
        const nameH = pdf.heightOfString(nameLine, { width: colW });
        const instrH = instr ? pdf.heightOfString(instr, { width: colW - 22 }) : 0;
        if (ensureRoom(nameH + instrH + 10)) labHeader(); // repeat the heading on a new page
        pdf.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(nameLine, colX, y, { width: colW });
        y += nameH + 1;
        if (instr) {
          pdf.font('Helvetica-Oblique').fontSize(9.5).fillColor(MUTED).text(instr, colX + 22, y, { width: colW - 22 });
          y += instrH + 1;
        }
        y += 8;
      });
    }

    pdf.end();
  });
}
