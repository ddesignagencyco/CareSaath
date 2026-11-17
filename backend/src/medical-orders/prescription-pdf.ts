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
const TEAL = '#0f766e';
const GOLD = '#f5b544';
const INK = '#1f2937';
const MUTED = '#6b7280';
const PATIENT_BG = '#eaf2f9';
const PATIENT_BORDER = '#d4e3f0';
const CARD_BG = '#f7fafc';
const CARD_BORDER = '#e4ebf1';
const RULE = '#d7dee6';

const LEFT = 36;
const RIGHT = 559;
const CW = RIGHT - LEFT;

/* Clinical-notes band (full width, diagnosis + general advice side by side). */
const BODY_TOP = 172;
const NOTES_HEADER_H = 24;
const NOTES_PAD = 14;
const NOTES_HEADING_DY = 33.5;
const NOTES_RULE_DY = 47.5;
const NOTES_BODY_DY = 54.5;
const NOTES_BOTTOM_PAD = 3.6;
const NOTES_LEFT_X = LEFT + NOTES_PAD;
const NOTES_LEFT_W = 294;
const NOTES_RIGHT_X = LEFT + 345;
/** Advice lines run slightly past the inner padding, matching the reference. */
const ADVICE_TEXT_X = NOTES_RIGHT_X + 12;
const ADVICE_W = RIGHT - 8 - ADVICE_TEXT_X;

/* Two-column medicine / lab-test grid. */
const GUTTER = 10.5;
const CARD_W = (CW - GUTTER) / 2;
const MED_GAP = 4.3;
const LAB_GAP = 4.6;

const BODY_BOTTOM = 755; // content stops above the wave footer
const CONT_TOP = 112; // first flow position on continuation pages

const RIBBON_W = 52;
const RIBBON_POINT = 11;
const RIBBON_H = 29;

/* ----------------------------- small vector icons ------------------------- */
function iconPerson(
  pdf: PDFKit.PDFDocument,
  x: number,
  y: number,
  s: number,
  c: string,
): void {
  pdf.save();
  pdf.circle(x + s * 0.5, y + s * 0.3, s * 0.16).fill(c);
  pdf
    .path(
      `M ${x + s * 0.18} ${y + s * 0.84} C ${x + s * 0.18} ${y + s * 0.52}, ${x + s * 0.82} ${y + s * 0.52}, ${x + s * 0.82} ${y + s * 0.84} Z`,
    )
    .fill(c);
  pdf.restore();
}
function iconCalendar(
  pdf: PDFKit.PDFDocument,
  x: number,
  y: number,
  s: number,
  c: string,
): void {
  pdf.save();
  pdf.lineWidth(1.3).strokeColor(c);
  pdf.roundedRect(x + s * 0.12, y + s * 0.2, s * 0.76, s * 0.68, 2).stroke();
  pdf
    .moveTo(x + s * 0.12, y + s * 0.38)
    .lineTo(x + s * 0.88, y + s * 0.38)
    .stroke();
  pdf
    .moveTo(x + s * 0.32, y + s * 0.12)
    .lineTo(x + s * 0.32, y + s * 0.26)
    .stroke();
  pdf
    .moveTo(x + s * 0.68, y + s * 0.12)
    .lineTo(x + s * 0.68, y + s * 0.26)
    .stroke();
  pdf.restore();
}
function iconClipboard(
  pdf: PDFKit.PDFDocument,
  x: number,
  y: number,
  s: number,
  c: string,
): void {
  pdf.save();
  pdf.lineWidth(1.3).strokeColor(c);
  pdf.roundedRect(x + s * 0.18, y + s * 0.16, s * 0.64, s * 0.74, 2).stroke();
  pdf
    .roundedRect(x + s * 0.36, y + s * 0.08, s * 0.28, s * 0.14, 1.5)
    .fillAndStroke(c, c);
  pdf.restore();
}
function iconBulb(
  pdf: PDFKit.PDFDocument,
  x: number,
  y: number,
  s: number,
  c: string,
): void {
  pdf.save();
  pdf.lineWidth(1.3).strokeColor(c);
  pdf.circle(x + s * 0.5, y + s * 0.4, s * 0.26).stroke();
  pdf
    .moveTo(x + s * 0.38, y + s * 0.78)
    .lineTo(x + s * 0.62, y + s * 0.78)
    .stroke();
  pdf
    .moveTo(x + s * 0.4, y + s * 0.88)
    .lineTo(x + s * 0.6, y + s * 0.88)
    .stroke();
  pdf.restore();
}
function iconFlask(
  pdf: PDFKit.PDFDocument,
  x: number,
  y: number,
  s: number,
  c: string,
): void {
  pdf.save();
  pdf.lineWidth(1.3).lineJoin('round').strokeColor(c);
  pdf
    .path(
      `M ${x + s * 0.4} ${y + s * 0.16} L ${x + s * 0.4} ${y + s * 0.46} L ${x + s * 0.2} ${y + s * 0.84} L ${x + s * 0.8} ${y + s * 0.84} L ${x + s * 0.6} ${y + s * 0.46} L ${x + s * 0.6} ${y + s * 0.16}`,
    )
    .stroke();
  pdf
    .moveTo(x + s * 0.34, y + s * 0.16)
    .lineTo(x + s * 0.66, y + s * 0.16)
    .stroke();
  pdf.restore();
}
function iconPill(
  pdf: PDFKit.PDFDocument,
  x: number,
  y: number,
  s: number,
  c: string,
): void {
  pdf.save();
  pdf.lineWidth(1.2).strokeColor(c);
  pdf
    .roundedRect(x + s * 0.12, y + s * 0.36, s * 0.76, s * 0.26, s * 0.13)
    .stroke();
  pdf
    .moveTo(x + s * 0.5, y + s * 0.36)
    .lineTo(x + s * 0.5, y + s * 0.62)
    .stroke();
  pdf.restore();
}
function iconGlass(
  pdf: PDFKit.PDFDocument,
  x: number,
  y: number,
  s: number,
  c: string,
): void {
  pdf.save();
  pdf.lineWidth(1.2).lineJoin('round').strokeColor(c);
  pdf
    .path(
      `M ${x + s * 0.3} ${y + s * 0.22} L ${x + s * 0.7} ${y + s * 0.22} L ${x + s * 0.64} ${y + s * 0.82} L ${x + s * 0.36} ${y + s * 0.82} Z`,
    )
    .stroke();
  pdf
    .moveTo(x + s * 0.33, y + s * 0.4)
    .lineTo(x + s * 0.67, y + s * 0.4)
    .stroke();
  pdf.restore();
}

/** CareSaath heart logo (teal + gold interlocking hearts). */
function drawHeart(
  pdf: PDFKit.PDFDocument,
  x: number,
  y: number,
  size: number,
  opacity = 1,
): void {
  const scale = size / 48;
  pdf.save();
  pdf.opacity(opacity);
  pdf.translate(x, y).scale(scale);
  pdf.lineWidth(4).lineCap('round').lineJoin('round');
  pdf
    .path(
      'M24 38 C16.5 32.5 11 27.8 11 22.4 C11 18.6 13.8 16.2 17 16.2 C20 16.2 22.6 18 24 20.8',
    )
    .stroke(TEAL);
  pdf
    .path(
      'M24 38 C31.5 32.5 37 27.8 37 22.4 C37 18.6 34.2 16.2 31 16.2 C28 16.2 25.4 18 24 20.8',
    )
    .stroke(GOLD);
  pdf.circle(17, 9.6, 3.3).fill(TEAL);
  pdf.circle(31, 9.6, 3.3).fill(GOLD);
  pdf.restore();
}

/** Faint heart-with-pulse watermark for the general-advice column. */
function drawPulseWatermark(
  pdf: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  w: number,
): void {
  pdf.save();
  pdf.opacity(0.06);
  const s = w / 48;
  pdf.translate(cx - w / 2, cy - w / 2).scale(s);
  pdf
    .path(
      'M24 42 C10 32 4 25 4 16.5 C4 10 9 6 15 6 C19 6 22.5 8.4 24 11.8 C25.5 8.4 29 6 33 6 C39 6 44 10 44 16.5 C44 25 38 32 24 42 Z',
    )
    .fill(TEAL);
  pdf.restore();
}

/** Layered teal/gold/navy wave band across the foot of the page. */
function drawWaveFooter(pdf: PDFKit.PDFDocument, w: number, h: number): void {
  const band = (yBase: number, amp: number, color: string) => {
    pdf.save();
    pdf.moveTo(0, yBase);
    pdf.bezierCurveTo(
      w * 0.28,
      yBase - amp,
      w * 0.5,
      yBase + amp,
      w * 0.72,
      yBase,
    );
    pdf.bezierCurveTo(
      w * 0.88,
      yBase - amp * 0.7,
      w,
      yBase + amp * 0.5,
      w,
      yBase - 2,
    );
    pdf.lineTo(w, h).lineTo(0, h).fill(color);
    pdf.restore();
  };
  band(h - 67, 16, TEAL);
  band(h - 53, 18, GOLD);
  band(h - 39, 15, NAVY);
}

/** Right-aligned "Name (Designation)" — big name + small parenthetical role. */
function drawRightNameDes(
  pdf: PDFKit.PDFDocument,
  rightEdge: number,
  name: string,
  des: string,
  y: number,
  big: number,
  small: number,
): void {
  // The role is shown as "(Doctor)", so drop any leading "Dr." already in the name.
  const nameTxt = pdfSafe(name.replace(/^\s*dr\.?\s+/i, ''));
  const desTxt = `  (${pdfSafe(des)})`;
  pdf.font('Helvetica-Bold').fontSize(big);
  const nameW = pdf.widthOfString(nameTxt);
  pdf.font('Helvetica-Bold').fontSize(small);
  const desW = pdf.widthOfString(desTxt);
  const startX = rightEdge - nameW - desW;
  pdf
    .font('Helvetica-Bold')
    .fontSize(big)
    .fillColor(NAVY)
    .text(nameTxt, startX, y, { lineBreak: false });
  pdf
    .font('Helvetica-Bold')
    .fontSize(small)
    .fillColor(TEAL)
    .text(desTxt, startX + nameW, y + (big - small) * 0.68, {
      lineBreak: false,
    });
}

/** The ℞ mark. */
function drawRxMark(
  pdf: PDFKit.PDFDocument,
  x: number,
  y: number,
  color: string,
  big = 22,
): void {
  pdf
    .font('Helvetica-Bold')
    .fontSize(big)
    .fillColor(color)
    .text('R', x, y, { lineBreak: false });
  const rWidth = pdf.widthOfString('R');
  pdf
    .font('Helvetica-Bold')
    .fontSize(big * 0.58)
    .fillColor(color)
    .text('x', x + rWidth - big * 0.14, y + big * 0.5, { lineBreak: false });
}

const ADVICE = [
  'Take medicines exactly as prescribed',
  'Complete the full course',
  'Keep hydrated and rest well',
  'Return if symptoms persist or worsen',
];

/** Render a prescription to PDF bytes. Pass `compress: false` to inspect the text in tests. */
export function buildPrescriptionPdf(
  rx: PrescriptionPdfData,
  options: { compress?: boolean } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      // bottom margin 0 so the wave footer (below the text margin) never triggers
      // PDFKit auto-pagination; body pagination is manual.
      margins: { top: LEFT, left: LEFT, right: LEFT, bottom: 0 },
      compress: options.compress ?? true,
      info: {
        Title: `Prescription ${rx.prescriptionNumber}`,
        Author: 'CareSaath',
      },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    // Wave footer is the only fixed furniture on every page. pageAdded does NOT
    // fire for the implicit first page, so paint page 1 by hand.
    const paintFooter = () =>
      drawWaveFooter(pdf, pdf.page.width, pdf.page.height);
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
      pdf
        .moveTo(LEFT + 58, 33)
        .lineTo(LEFT + 58, 81)
        .strokeColor(RULE)
        .lineWidth(1)
        .stroke();
      pdf
        .font('Helvetica-Bold')
        .fontSize(25)
        .fillColor(NAVY)
        .text('CareSaath', bx, 30);
      pdf
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor(TEAL)
        .text('Home Nursing & Physiotherapy', bx, 56);
      pdf
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor(MUTED)
        .text('Licensed caregivers across Pakistan', bx, 69);
      pdf
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(
          pdfSafe(
            `Rx No. ${rx.prescriptionNumber}   ·   Issued ${formatDate(rx.issuedAt)}`,
          ),
          bx,
          81,
        );
      drawRightNameDes(
        pdf,
        RIGHT,
        rx.doctorName,
        rx.doctorSpecialty,
        32,
        20,
        11,
      );
      pdf
        .font('Helvetica')
        .fontSize(9)
        .fillColor(INK)
        .text(pdfSafe(lic), RIGHT - 320, 57, { width: 320, align: 'right' });
      pdf
        .moveTo(LEFT, 100)
        .lineTo(RIGHT, 100)
        .strokeColor(RULE)
        .lineWidth(1)
        .stroke();
    };
    drawHeader();

    /* ------------------------- patient bar ------------------------------- */
    const pbY = 114;
    const pbH = 46;
    pdf
      .roundedRect(LEFT, pbY, CW, pbH, 10)
      .fillAndStroke(PATIENT_BG, PATIENT_BORDER);
    const cellW = CW / 3;
    const cell = (
      idx: number,
      icon: (
        p: PDFKit.PDFDocument,
        x: number,
        y: number,
        s: number,
        c: string,
      ) => void,
      label: string,
      value: string,
    ) => {
      const cxs = LEFT + idx * cellW + 16;
      icon(pdf, cxs, pbY + 13, 20, TEAL);
      const tx = cxs + 28;
      pdf
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(label.toUpperCase(), tx, pbY + 11, { characterSpacing: 0.4 });
      pdf
        .font('Helvetica-Bold')
        .fontSize(11.5)
        .fillColor(NAVY)
        .text(pdfSafe(value), tx, pbY + 23, {
          width: cellW - 44,
          lineBreak: false,
          ellipsis: true,
        });
      if (idx > 0)
        pdf
          .moveTo(LEFT + idx * cellW, pbY + 9)
          .lineTo(LEFT + idx * cellW, pbY + pbH - 9)
          .strokeColor(PATIENT_BORDER)
          .lineWidth(1)
          .stroke();
    };
    const gender = rx.patientGender
      ? rx.patientGender.charAt(0).toUpperCase() + rx.patientGender.slice(1)
      : null;
    const ageSex =
      [rx.patientAge != null ? `${rx.patientAge} yrs` : null, gender]
        .filter(Boolean)
        .join('  ·  ') || '—';
    cell(0, iconPerson, 'Patient', rx.patientName);
    cell(1, iconCalendar, 'Age / Sex', ageSex);
    cell(2, iconCalendar, 'Visit Date', formatDate(rx.visitDate));

    /* ---------------------- clinical notes band --------------------------- */
    const diagTxt = rx.diagnosis ? pdfSafe(rx.diagnosis) : '—';
    const adviceHeights = ADVICE.map((a) => {
      pdf.font('Helvetica').fontSize(9.5);
      return pdf.heightOfString(a, { width: ADVICE_W, lineGap: 2 });
    });
    const adviceH = adviceHeights.reduce((sum, h) => sum + h, 0);

    pdf.font('Helvetica').fontSize(10);
    const diagH = pdf.heightOfString(diagTxt, {
      width: NOTES_LEFT_W,
      lineGap: 1,
    });

    const maxNotesH = BODY_BOTTOM - BODY_TOP;
    const maxContentH = maxNotesH - NOTES_BODY_DY - NOTES_BOTTOM_PAD;
    const diagClipped = diagH > maxContentH;
    const notesH = Math.min(
      NOTES_BODY_DY +
        Math.max(diagClipped ? maxContentH : diagH, adviceH) +
        NOTES_BOTTOM_PAD,
      maxNotesH,
    );

    pdf
      .roundedRect(LEFT, BODY_TOP, CW, notesH, 10)
      .fillAndStroke('#ffffff', CARD_BORDER);
    // navy header bar with rounded top corners only
    pdf.save();
    pdf.roundedRect(LEFT, BODY_TOP, CW, NOTES_HEADER_H, 10).fill(NAVY);
    pdf.rect(LEFT, BODY_TOP + NOTES_HEADER_H - 10, CW, 10).fill(NAVY);
    pdf.restore();
    iconClipboard(pdf, LEFT + NOTES_PAD, BODY_TOP + 5, 14, '#ffffff');
    pdf
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#ffffff')
      .text('Clinical Notes', LEFT + 34, BODY_TOP + 6.5);

    drawPulseWatermark(pdf, RIGHT - 48, BODY_TOP + 62, 62);

    const notesHeadingY = BODY_TOP + NOTES_HEADING_DY;
    const notesRuleY = BODY_TOP + NOTES_RULE_DY;
    const notesBodyY = BODY_TOP + NOTES_BODY_DY;

    pdf
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(TEAL)
      .text('Diagnosis', NOTES_LEFT_X, notesHeadingY);
    pdf
      .moveTo(NOTES_LEFT_X, notesRuleY)
      .lineTo(NOTES_LEFT_X + 40, notesRuleY)
      .strokeColor(GOLD)
      .lineWidth(1.5)
      .stroke();
    pdf
      .font('Helvetica')
      .fontSize(10)
      .fillColor(INK)
      .text(diagTxt, NOTES_LEFT_X, notesBodyY, {
        width: NOTES_LEFT_W,
        lineGap: 1,
        ...(diagClipped ? { height: maxContentH, ellipsis: true } : {}),
      });

    iconBulb(pdf, NOTES_RIGHT_X, notesHeadingY - 1, 14, GOLD);
    pdf
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(TEAL)
      .text('General Advice', NOTES_RIGHT_X + 17, notesHeadingY);
    pdf
      .moveTo(NOTES_RIGHT_X, notesRuleY)
      .lineTo(NOTES_RIGHT_X + 40, notesRuleY)
      .strokeColor(GOLD)
      .lineWidth(1.5)
      .stroke();
    let ya = notesBodyY;
    ADVICE.forEach((a, i) => {
      pdf.circle(NOTES_RIGHT_X + 2, ya + 4.5, 1.8).fill(TEAL);
      pdf
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(INK)
        .text(a, ADVICE_TEXT_X, ya, { width: ADVICE_W, lineGap: 2 });
      ya += adviceHeights[i]!;
    });

    /* ------------------------- Rx ribbon ---------------------------------- */
    const drawRibbon = (x: number, top: number) => {
      pdf.save();
      pdf
        .path(
          `M ${x} ${top} L ${x + RIBBON_W} ${top} L ${x + RIBBON_W + RIBBON_POINT} ${top + RIBBON_H / 2} L ${x + RIBBON_W} ${top + RIBBON_H} L ${x} ${top + RIBBON_H} Z`,
        )
        .fill(NAVY);
      pdf.restore();
      drawRxMark(pdf, x + 12, top + 3.5, '#ffffff', 20);
      pdf
        .moveTo(x + RIBBON_W + RIBBON_POINT + 16, top + RIBBON_H / 2)
        .lineTo(RIGHT, top + RIBBON_H / 2)
        .strokeColor(RULE)
        .lineWidth(1)
        .stroke();
    };

    let y = BODY_TOP + notesH + 8;
    drawRibbon(LEFT, y);
    y += RIBBON_H + 7;

    const newPage = () => {
      pdf.addPage();
      drawHeader();
      drawRibbon(LEFT, CONT_TOP);
      y = CONT_TOP + RIBBON_H + 7;
    };

    /* ------------------------- medicines grid ----------------------------- */
    // Card geometry: dynamically computed so long medicine names, multi-part dosages,
    // and instructions wrap cleanly within the card width without overflowing the page.
    const medHeights = (m: PrescriptionMedicineLine) => {
      pdf.font('Helvetica-Bold').fontSize(12);
      const nameH = pdf.heightOfString(pdfSafe(m.name), { width: CARD_W - 45 });
      const hasDose = !!(m.dosage || m.frequency || m.duration);

      const segments: string[] = [];
      if (m.dosage) segments.push(pdfSafe(m.dosage));
      if (m.frequency) segments.push(pdfSafe(m.frequency));
      if (m.duration) segments.push(pdfSafe(m.duration));

      const doseStr = segments.join(' · ');
      pdf.font('Helvetica').fontSize(9);
      const doseH = hasDose ? pdf.heightOfString(doseStr, { width: CARD_W - 58, lineGap: 1 }) : 0;

      const instr = m.instructions ? pdfSafe(m.instructions) : '';
      pdf.font('Helvetica-Oblique').fontSize(8.5);
      const instrH = instr ? pdf.heightOfString(instr, { width: CARD_W - 58, lineGap: 1 }) : 0;

      let contentH = 5.9 + nameH;
      if (hasDose) contentH += 3 + doseH;
      if (instr) contentH += 3 + instrH;
      const cardH = Math.max(38, contentH + 5);

      return { nameH, hasDose, doseH, instr, instrH, cardH };
    };

    const drawMedCard = (
      m: PrescriptionMedicineLine,
      cx: number,
      top: number,
      index: number,
      h: ReturnType<typeof medHeights>,
    ) => {
      pdf
        .roundedRect(cx, top, CARD_W, h.cardH, 8)
        .fillAndStroke(CARD_BG, CARD_BORDER);
      pdf
        .circle(cx + 18, top + 18, 10)
        .lineWidth(1.3)
        .fillAndStroke('#ffffff', TEAL);
      pdf
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(TEAL)
        .text(`${index}`, cx + 8, top + 13.5, { width: 20, align: 'center' });

      const textX = cx + 35;
      const nameY = top + 5.9;
      pdf
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(NAVY)
        .text(pdfSafe(m.name), textX, nameY, { width: CARD_W - 45 });

      let currentY = nameY + h.nameH + 3;

      if (h.hasDose) {
        iconPill(pdf, cx + 34, currentY, 11, TEAL);
        const doseTextX = cx + 50;
        const doseW = CARD_W - 58;

        const segments: Array<{ text: string; bold?: boolean; color: string }> = [];
        if (m.dosage) segments.push({ text: pdfSafe(m.dosage), color: INK });
        if (m.frequency) segments.push({ text: pdfSafe(m.frequency), color: INK });
        if (m.duration) segments.push({ text: pdfSafe(m.duration), bold: true, color: TEAL });

        if (segments.length > 0) {
          pdf
            .font(segments[0]!.bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(9)
            .fillColor(segments[0]!.color)
            .text(segments[0]!.text, doseTextX, currentY, {
              width: doseW,
              lineGap: 1,
              continued: segments.length > 1,
            });

          for (let si = 1; si < segments.length; si++) {
            const seg = segments[si]!;
            pdf.font('Helvetica').fontSize(9).fillColor(MUTED).text(' · ', { continued: true });
            pdf
              .font(seg.bold ? 'Helvetica-Bold' : 'Helvetica')
              .fontSize(9)
              .fillColor(seg.color)
              .text(seg.text, { continued: si < segments.length - 1 });
          }
        }

        currentY += h.doseH + 3;
      }

      if (h.instr) {
        iconGlass(pdf, cx + 34, currentY, 11, GOLD);
        pdf
          .font('Helvetica-Oblique')
          .fontSize(8.5)
          .fillColor(MUTED)
          .text(h.instr, cx + 50, currentY, { width: CARD_W - 58, lineGap: 1 });
      }
    };

    for (let i = 0; i < rx.medicines.length; i += 2) {
      const pair = rx.medicines.slice(i, i + 2);
      const heights = pair.map((m) => medHeights(m));
      const rowH = Math.max(...heights.map((h) => h.cardH));
      if (y + rowH > BODY_BOTTOM) newPage();
      pair.forEach((m, k) =>
        drawMedCard(m, LEFT + k * (CARD_W + GUTTER), y, i + k + 1, heights[k]!),
      );
      y += rowH + MED_GAP;
    }

    if (rx.medicines.length === 0) {
      pdf
        .font('Helvetica-Oblique')
        .fontSize(10)
        .fillColor(MUTED)
        .text('No medicines prescribed.', LEFT, y);
      y += 18;
    } else {
      y -= MED_GAP; // the loop's trailing gap is not needed before the next section
    }

    /* ---------------------- investigations grid --------------------------- */
    if (rx.labTests.length > 0) {
      const labHeights = (t: PrescriptionLabTestLine) => {
        pdf.font('Helvetica-Bold').fontSize(11);
        const nameH = pdf.heightOfString(pdfSafe(t.name), {
          width: CARD_W - 45,
        });
        const instr = t.instructions ? pdfSafe(t.instructions) : '';
        pdf.font('Helvetica-Oblique').fontSize(8.5);
        const instrH = instr
          ? pdf.heightOfString(instr, { width: CARD_W - 45, lineGap: 1 })
          : 0;
        let contentH = 5.2 + nameH;
        if (instr) contentH += 2 + instrH;
        const cardH = Math.max(34, contentH + 5);
        return {
          nameH,
          instr,
          cardH,
        };
      };

      const drawLabCard = (
        t: PrescriptionLabTestLine,
        cx: number,
        top: number,
        index: number,
        h: ReturnType<typeof labHeights>,
      ) => {
        pdf
          .roundedRect(cx, top, CARD_W, h.cardH, 8)
          .fillAndStroke(CARD_BG, CARD_BORDER);
        pdf
          .circle(cx + 18, top + 15.5, 9)
          .lineWidth(1.3)
          .fillAndStroke('#ffffff', TEAL);
        pdf
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .fillColor(TEAL)
          .text(`${index}`, cx + 9, top + 11.5, { width: 18, align: 'center' });
        const textX = cx + 35;
        const nameY = top + 5.2;
        pdf
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(NAVY)
          .text(pdfSafe(t.name), textX, nameY, { width: CARD_W - 45 });
        if (h.instr) {
          pdf
            .font('Helvetica-Oblique')
            .fontSize(8.5)
            .fillColor(MUTED)
            .text(h.instr, textX, nameY + h.nameH + 2, { width: CARD_W - 45, lineGap: 1 });
        }
      };

      const firstRowH = Math.max(
        ...rx.labTests.slice(0, 2).map((t) => labHeights(t).cardH),
      );
      if (y + 9 + 18.6 + 7.2 + firstRowH > BODY_BOTTOM) {
        newPage();
      } else {
        y += 9;
      }

      // Kept in a closure so a page break can repeat the heading.
      let labTop = y;
      const drawLabHeader = () => {
        iconFlask(pdf, LEFT + 2, labTop - 1, 15, TEAL);
        pdf
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(TEAL)
          .text('INVESTIGATIONS / LAB TESTS', LEFT + 23, labTop, {
            characterSpacing: 0.4,
          });
        const ruleY = labTop + 18.6;
        pdf
          .moveTo(LEFT, ruleY)
          .lineTo(RIGHT, ruleY)
          .strokeColor(RULE)
          .lineWidth(1)
          .stroke();
        labTop = ruleY + 7.2;
      };
      drawLabHeader();
      y = labTop;

      for (let i = 0; i < rx.labTests.length; i += 2) {
        const pair = rx.labTests.slice(i, i + 2);
        const heights = pair.map((t) => labHeights(t));
        const rowH = Math.max(...heights.map((h) => h.cardH));
        if (y + rowH > BODY_BOTTOM) {
          newPage();
          labTop = y;
          drawLabHeader();
          y = labTop;
        }
        pair.forEach((t, k) =>
          drawLabCard(
            t,
            LEFT + k * (CARD_W + GUTTER),
            y,
            i + k + 1,
            heights[k]!,
          ),
        );
        y += rowH + LAB_GAP;
      }
    }

    pdf.end();
  });
}
