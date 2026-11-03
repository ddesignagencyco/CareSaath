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
const BRAND_DEEP = '#0b5f58';
const MARIGOLD = '#f5b544';
const MUTED = '#6b7280';
const INK = '#111827';
const PANEL_BG = '#f4faf8';
const PANEL_BORDER = '#dce9e6';
const HAIRLINE = '#e3e8ea';
const ON_TEAL = '#ffffff';
const ON_TEAL_SOFT = '#c7e8e2';
const ON_TEAL_DIM = '#a6d8d0';
const TICK_OFF = '#cbd5e1';

const PAGE_H = 841.89;
const LEFT = 42;
const RIGHT = 553;
const CW = RIGHT - LEFT;

const MASTHEAD_H = 76;
const FOOTER_TOP = 792;

// Left notes panel | right Rx column.
const LEFT_PANEL_W = 170;
const LEFT_CONTENT_X = LEFT + 12;
const LEFT_CONTENT_W = LEFT_PANEL_W - 24;
const RIGHT_COL_X = LEFT + LEFT_PANEL_W + 16;
const RIGHT_COL_W = RIGHT - RIGHT_COL_X;
const BODY_TOP = 104;
const BODY_BOTTOM = 735; // content stops here; signature + footer sit below
const SIG_Y = 744; // signature block is pinned here (bottom-right)

/** Two interlocking hearts (the CareSaath heart), strokes in `cA`/`cB`, no tile. */
function drawHeartGlyph(pdf: PDFKit.PDFDocument, x: number, y: number, size: number, cA: string, cB: string, opacity = 1): void {
  const scale = size / 48;
  pdf.save();
  pdf.opacity(opacity);
  pdf.translate(x, y).scale(scale);
  pdf.lineWidth(4).lineCap('round').lineJoin('round');
  pdf.path('M24 38 C16.5 32.5 11 27.8 11 22.4 C11 18.6 13.8 16.2 17 16.2 C20 16.2 22.6 18 24 20.8').stroke(cA);
  pdf.path('M24 38 C31.5 32.5 37 27.8 37 22.4 C37 18.6 34.2 16.2 31 16.2 C28 16.2 25.4 18 24 20.8').stroke(cB);
  pdf.circle(17, 9.6, 3.3).fill(cA);
  pdf.circle(31, 9.6, 3.3).fill(cB);
  pdf.restore();
}

/** Large, pale, centred heart — the brand watermark behind the body. */
function drawWatermark(pdf: PDFKit.PDFDocument, pageWidth: number, pageHeight: number): void {
  const size = pageWidth * 0.34;
  drawHeartGlyph(pdf, pageWidth / 2 - size / 2, pageHeight * 0.46 - size / 2, size, BRAND, MARIGOLD, 0.06);
}

/** Branded teal masthead: wordmark (left) + logo badge (centre). Fixed on every page. */
function drawMasthead(pdf: PDFKit.PDFDocument, pageWidth: number): void {
  pdf.save();
  pdf.rect(0, 0, pageWidth, MASTHEAD_H).fill(BRAND);
  pdf.rect(0, MASTHEAD_H, pageWidth, 2.5).fill(MARIGOLD);
  pdf.restore();

  pdf.font('Helvetica-Bold').fontSize(18).fillColor(ON_TEAL).text('CareSaath', LEFT, 19);
  pdf.font('Helvetica').fontSize(8.5).fillColor(ON_TEAL_SOFT).text('Home Nursing & Physiotherapy', LEFT, 43);
  pdf.font('Helvetica').fontSize(8).fillColor(ON_TEAL_DIM).text('Pakistan  ·  caresaath.com', LEFT, 55);

  const cx = pageWidth / 2;
  const cy = 35;
  pdf.save();
  pdf.circle(cx, cy, 20).fill(ON_TEAL);
  pdf.restore();
  drawHeartGlyph(pdf, cx - 15, cy - 15, 30, BRAND, MARIGOLD);
}

/** Branded teal footer band with the CareSaath contact line. Fixed on every page. */
function drawFooterBand(pdf: PDFKit.PDFDocument, pageWidth: number, pageHeight: number): void {
  pdf.save();
  pdf.rect(0, FOOTER_TOP, pageWidth, pageHeight - FOOTER_TOP).fill(BRAND);
  pdf.rect(0, FOOTER_TOP, pageWidth, 2.5).fill(MARIGOLD);
  pdf.restore();
  pdf.font('Helvetica-Bold').fontSize(10.5).fillColor(ON_TEAL).text('CareSaath', LEFT, FOOTER_TOP + 9, { width: CW, align: 'center' });
  pdf
    .font('Helvetica')
    .fontSize(8)
    .fillColor(ON_TEAL_SOFT)
    .text('Home Nursing & Physiotherapy  ·  Pakistan  ·  caresaath.com', LEFT, FOOTER_TOP + 24, { width: CW, align: 'center' });
  pdf
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(ON_TEAL_DIM)
    .text('Computer-generated prescription issued through CareSaath. Valid without a signature.', LEFT, FOOTER_TOP + 35, { width: CW, align: 'center' });
}

/** The ℞ apothecary mark: a bold "R" with a small crossed-leg "x". */
function drawRxMark(pdf: PDFKit.PDFDocument, x: number, y: number): void {
  pdf.font('Helvetica-Bold').fontSize(30).fillColor(BRAND).text('R', x, y, { lineBreak: false });
  const rWidth = pdf.widthOfString('R');
  pdf.font('Helvetica-Bold').fontSize(17).fillColor(BRAND).text('x', x + rWidth - 4, y + 15, { lineBreak: false });
}

/** A small vector tick (on) or a light dash (off), centred at (cx, cy). */
function drawTick(pdf: PDFKit.PDFDocument, cx: number, cy: number, on: boolean): void {
  pdf.save();
  if (on) {
    pdf.lineWidth(1.5).lineCap('round').lineJoin('round').strokeColor(BRAND);
    pdf.moveTo(cx - 3, cy).lineTo(cx - 0.5, cy + 2.8).lineTo(cx + 3.8, cy - 3).stroke();
  } else {
    pdf.lineWidth(1).strokeColor(TICK_OFF);
    pdf.moveTo(cx - 2.5, cy).lineTo(cx + 2.5, cy).stroke();
  }
  pdf.restore();
}

/** Derive Morning / Afternoon / Night dosing from the free-text frequency. */
function parseTiming(freq?: string | null): { m: boolean; a: boolean; n: boolean } {
  const f = (freq || '').toLowerCase();
  if (/\b(as needed|sos|prn|when required|if needed)\b/.test(f)) return { m: false, a: false, n: false };
  if (/(four times|4 times|\bqid\b|4x|every\s*6\s*hour|6\s*hourly)/.test(f)) return { m: true, a: true, n: true };
  if (/(thrice|three times|3 times|\btid\b|3x|every\s*8\s*hour|8\s*hourly)/.test(f)) return { m: true, a: true, n: true };
  if (/(twice|two times|2 times|\bbid\b|2x|every\s*12\s*hour|12\s*hourly)/.test(f)) return { m: true, a: false, n: true };
  const m = /morning|breakfast|\bam\b|morn/.test(f);
  const a = /afternoon|noon|midday|lunch/.test(f);
  const n = /night|evening|bedtime|\bhs\b|dinner/.test(f);
  if (m || a || n) return { m, a, n };
  if (/(once|daily|\bod\b|1x|one time|per day)/.test(f)) return { m: true, a: false, n: false };
  return { m: false, a: false, n: false };
}

/** Render a prescription to PDF bytes. Pass `compress: false` to inspect the text in tests. */
export function buildPrescriptionPdf(
  rx: PrescriptionPdfData,
  options: { compress?: boolean } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      // Bottom margin 0 so drawing the footer band (which sits below the usual
      // text margin) never triggers PDFKit auto-pagination — that would fire
      // pageAdded, repaint the footer, overflow again, and recurse forever.
      // Body pagination is handled manually via ensureRoom().
      margins: { top: LEFT, left: LEFT, right: LEFT, bottom: 0 },
      compress: options.compress ?? true,
      info: { Title: `Prescription ${rx.prescriptionNumber}`, Author: 'CareSaath' },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    // Fixed letterhead furniture. pageAdded does NOT fire for the implicit first
    // page (created before this listener attaches), so page 1 is painted by hand.
    const paintFurniture = () => {
      drawWatermark(pdf, pdf.page.width, pdf.page.height);
      drawMasthead(pdf, pdf.page.width);
      drawFooterBand(pdf, pdf.page.width, pdf.page.height);
    };
    pdf.on('pageAdded', paintFurniture);
    paintFurniture();

    const licenseLabel = rx.licenseBody === 'OTHER' ? 'Reg' : rx.licenseBody;

    // ---- Prescriber identity (right of the masthead, white on teal) ----------
    const rb = { x: RIGHT - 235, w: 235 };
    pdf.font('Helvetica-Bold').fontSize(14).fillColor(ON_TEAL).text(pdfSafe(`Dr. ${rx.doctorName}`), rb.x, 18, { width: rb.w, align: 'right' });
    pdf.font('Helvetica-Bold').fontSize(9.5).fillColor(MARIGOLD).text(pdfSafe(rx.doctorSpecialty), rb.x, 37, { width: rb.w, align: 'right' });
    pdf
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(ON_TEAL)
      .text(pdfSafe(`${licenseLabel} No: ${rx.licenseNumber}`), rb.x, 50, { width: rb.w, align: 'right' });
    if (rx.licenseExpiry) {
      pdf.font('Helvetica').fontSize(8).fillColor(ON_TEAL_SOFT).text(`Valid till ${formatDate(rx.licenseExpiry)}`, rb.x, 62, { width: rb.w, align: 'right' });
    }

    // ---- Meta row: number / issued (right) -----------------------------------
    pdf
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(pdfSafe(`No. ${rx.prescriptionNumber}   ·   Issued ${formatDateTime(rx.issuedAt)}`), LEFT, 88, { width: CW, align: 'right' });

    // ---- Left panel: patient / visit info + clinical notes (column-wise) -----
    const panelTop = BODY_TOP - 2;
    pdf.roundedRect(LEFT, panelTop, LEFT_PANEL_W, BODY_BOTTOM - panelTop, 8).fillAndStroke(PANEL_BG, PANEL_BORDER);

    let yl = panelTop + 12;
    const stackField = (label: string, value: string) => {
      pdf.font('Helvetica-Bold').fontSize(6.8).fillColor(MUTED).text(label.toUpperCase(), LEFT_CONTENT_X, yl, { width: LEFT_CONTENT_W, characterSpacing: 0.6 });
      yl += 9;
      pdf.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(pdfSafe(value), LEFT_CONTENT_X, yl, { width: LEFT_CONTENT_W });
      yl += pdf.heightOfString(pdfSafe(value), { width: LEFT_CONTENT_W }) + 9;
    };

    pdf.font('Helvetica-Bold').fontSize(8).fillColor(BRAND).text('VISIT', LEFT_CONTENT_X, yl, { characterSpacing: 1 });
    yl += 13;
    stackField('Patient', rx.patientName);
    const ageSex = [rx.patientAge != null ? `${rx.patientAge} yrs` : null, rx.patientGender || null].filter(Boolean).join('  ·  ') || '—';
    stackField('Age / Sex', ageSex);
    stackField('Visit date', formatDate(rx.visitDate));

    if (rx.diagnosis) {
      yl += 2;
      pdf.moveTo(LEFT_CONTENT_X, yl).lineTo(LEFT + LEFT_PANEL_W - 12, yl).strokeColor(PANEL_BORDER).lineWidth(0.8).stroke();
      yl += 10;
      pdf.font('Helvetica-Bold').fontSize(8).fillColor(BRAND).text('DIAGNOSIS', LEFT_CONTENT_X, yl, { characterSpacing: 1 });
      yl += 12;
      pdf.font('Helvetica').fontSize(9.5).fillColor(INK).text(pdfSafe(rx.diagnosis), LEFT_CONTENT_X, yl, { width: LEFT_CONTENT_W });
    }

    // ---- Right column: ℞ then the numbered medicine table --------------------
    let colX = RIGHT_COL_X;
    let colW = RIGHT_COL_W;
    let y = BODY_TOP;

    // ℞ mark on its own line (replaces any "Prescription" heading), full rule under it.
    drawRxMark(pdf, colX, y - 4);
    pdf
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text('M · A · N  =  Morning · Afternoon · Night', colX + 44, y + 10, { width: colW - 44, align: 'right' });
    y += 30;
    pdf.moveTo(colX, y).lineTo(colX + colW, y).strokeColor(BRAND).lineWidth(1.2).stroke();
    y += 8;

    // Column geometry helper (recomputed per page because colW can change).
    const cols = () => {
      const nameW = colW * 0.44;
      const nameX = colX + 16;
      const tStart = nameX + nameW + 6;
      return {
        numX: colX,
        nameX,
        nameW,
        morn: tStart + 9,
        aft: tStart + 31,
        night: tStart + 53,
        durX: colX + colW - 48,
        durW: 48,
        subX: nameX,
        subW: colX + colW - nameX - 52,
      };
    };

    const drawMedHeader = () => {
      const c = cols();
      pdf.save();
      pdf.roundedRect(colX, y, colW, 15, 3).fill('#edf7f4');
      pdf.restore();
      pdf.font('Helvetica-Bold').fontSize(6.8).fillColor(BRAND_DEEP);
      pdf.text('#', c.numX + 3, y + 5);
      pdf.text('MEDICINE', c.nameX, y + 5, { width: c.nameW });
      pdf.text('M', c.morn - 3, y + 5);
      pdf.text('A', c.aft - 3, y + 5);
      pdf.text('N', c.night - 3, y + 5);
      pdf.text('DAYS', c.durX, y + 5, { width: c.durW, align: 'right' });
      y += 20;
    };

    // Returns true if a page break happened (so the caller can repaint headers).
    const ensureRoom = (needed: number): boolean => {
      if (y + needed > BODY_BOTTOM) {
        pdf.addPage();
        colX = LEFT;
        colW = CW;
        y = MASTHEAD_H + 18;
        return true;
      }
      return false;
    };

    if (rx.medicines.length > 0) {
      drawMedHeader();
      rx.medicines.forEach((m, i) => {
        const c = cols();
        const nameLine = pdfSafe(m.name);
        const sub = [m.dosage, m.frequency, m.instructions].map((s) => (s ? pdfSafe(s) : '')).filter(Boolean).join('   ·   ');
        pdf.font('Helvetica-Bold').fontSize(10.5);
        const nameHeight = pdf.heightOfString(nameLine, { width: c.nameW });
        pdf.font('Helvetica').fontSize(8.5);
        const subHeight = sub ? pdf.heightOfString(sub, { width: c.subW }) : 0;
        const rowHeight = Math.max(nameHeight, 13) + (sub ? subHeight + 3 : 0) + 11;
        if (ensureRoom(rowHeight)) drawMedHeader();
        const cc = cols();

        pdf.font('Helvetica-Bold').fontSize(9.5).fillColor(MUTED).text(`${i + 1}`, cc.numX + 2, y + 1, { width: 12 });
        pdf.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(nameLine, cc.nameX, y, { width: cc.nameW });
        const t = parseTiming(m.frequency);
        drawTick(pdf, cc.morn, y + 5, t.m);
        drawTick(pdf, cc.aft, y + 5, t.a);
        drawTick(pdf, cc.night, y + 5, t.n);
        pdf.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(pdfSafe(m.duration || '—'), cc.durX, y + 1, { width: cc.durW, align: 'right' });
        y += Math.max(nameHeight, 13) + 2;
        if (sub) {
          pdf.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(sub, cc.subX, y, { width: cc.subW });
          y += subHeight + 2;
        }
        pdf.moveTo(colX, y + 3).lineTo(colX + colW, y + 3).strokeColor(HAIRLINE).lineWidth(0.8).stroke();
        y += 11;
      });
    } else {
      pdf.font('Helvetica-Oblique').fontSize(9.5).fillColor(MUTED).text('No medicines prescribed.', colX, y, { width: colW });
      y += 18;
    }

    if (rx.labTests.length > 0) {
      ensureRoom(26);
      y += 6;
      pdf.save();
      pdf.roundedRect(colX, y + 1, 3.5, 11, 1.5).fill(MARIGOLD);
      pdf.restore();
      pdf.font('Helvetica-Bold').fontSize(9.5).fillColor(BRAND_DEEP).text('Investigations / Lab tests', colX + 10, y);
      y += 18;
      rx.labTests.forEach((lt, i) => {
        const nameLine = pdfSafe(`${i + 1}.  ${lt.name}`);
        const instr = lt.instructions ? pdfSafe(lt.instructions) : '';
        const nameHeight = pdf.heightOfString(nameLine, { width: colW });
        const instrHeight = instr ? pdf.heightOfString(instr, { width: colW - 14 }) : 0;
        ensureRoom(nameHeight + instrHeight + 9);
        pdf.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(nameLine, colX, y, { width: colW });
        y += nameHeight + 2;
        if (instr) {
          pdf.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(instr, colX + 14, y, { width: colW - 14 });
          y += instrHeight + 2;
        }
        y += 6;
      });
    }

    // ---- Signature: always pinned bottom-right (above the footer band) -------
    const sigW = 200;
    const sigX = RIGHT - sigW;
    pdf.moveTo(sigX, SIG_Y).lineTo(RIGHT, SIG_Y).strokeColor('#9ca3af').lineWidth(0.8).stroke();
    pdf.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(pdfSafe(`Dr. ${rx.doctorName}`), sigX, SIG_Y + 5, { width: sigW, align: 'right' });
    pdf
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(pdfSafe(`${rx.doctorSpecialty}  ·  ${licenseLabel} No: ${rx.licenseNumber}`), sigX, SIG_Y + 19, { width: sigW, align: 'right' });
    pdf.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED).text('Issued electronically', sigX, SIG_Y + 31, { width: sigW, align: 'right' });

    pdf.end();
  });
}
