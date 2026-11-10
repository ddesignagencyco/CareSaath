import PDFDocument from 'pdfkit';

export interface ReceiptLine {
  label: string;
  value: string;
}

export interface ReceiptSection {
  heading: string;
  lines: ReceiptLine[];
}

/** Everything a receipt shows, independent of how it is rendered. */
export interface ReceiptDocument {
  /** e.g. "Payment receipt" */
  title: string;
  receiptNumber: string;
  issuedAt: Date;
  sections: ReceiptSection[];
  /** The headline figure, shown in a highlighted box. */
  total?: ReceiptLine;
  footer?: string;
}

const BRAND = '#0f766e';
const BRAND_SOFT = '#f0fdfa';
const MUTED = '#6b7280';
const INK = '#111827';
const BORDER = '#e5e7eb';
const RULE = '#e6f0ee';
const WHITE = '#ffffff';
const LEFT = 50;
const VALUE_X = 230;
const RIGHT = 545;
const PAGE_W = 595;
const FOOTER_Y = 792;

/** Amounts are stored in paisa; receipts show rupees. */
export function formatMoney(paisa: number): string {
  return `Rs ${(paisa / 100).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Receipts are issued in Pakistan time. */
export function formatDateTime(date: Date): string {
  return `${date.toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })} PKT`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * The built-in PDF fonts only cover Latin-1, so text in other scripts (for
 * example an Urdu name) would print as garbage. Replace such characters rather
 * than corrupt the page.
 */
export function pdfSafe(text: string): string {
  return text.replace(/[^ -ÿ]/g, '?');
}

/** Render a receipt to PDF bytes. Pass `compress: false` to inspect the text in tests. */
export function buildReceiptPdf(
  receipt: ReceiptDocument,
  options: { compress?: boolean } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: LEFT,
      compress: options.compress ?? true,
      info: { Title: `${receipt.title} ${receipt.receiptNumber}`, Author: 'CareSaath' },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const drawFooter = () => {
      pdf.moveTo(LEFT, FOOTER_Y).lineTo(RIGHT, FOOTER_Y).strokeColor(BORDER).lineWidth(1).stroke();
      pdf
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(BRAND)
        .text('CareSaath', LEFT, FOOTER_Y + 10, { width: RIGHT - LEFT, align: 'center' });
      pdf
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(MUTED)
        .text('Questions about this receipt? info@caresaath.com', LEFT, FOOTER_Y + 22, {
          width: RIGHT - LEFT,
          align: 'center',
        })
        .text(
          pdfSafe(receipt.footer ?? 'This is a computer-generated receipt and needs no signature.'),
          LEFT,
          FOOTER_Y + 34,
          { width: RIGHT - LEFT, align: 'center' },
        );
    };

    // Header — brand accent bar, logo mark + wordmark, and the document meta on the right.
    pdf.rect(0, 0, PAGE_W, 6).fill(BRAND);
    const markTop = 46;
    pdf.roundedRect(LEFT, markTop, 36, 36, 9).fill(BRAND);
    pdf.font('Helvetica-Bold').fontSize(16).fillColor(WHITE).text('CS', LEFT, markTop + 10, { width: 36, align: 'center' });
    const wordX = LEFT + 48;
    pdf.font('Helvetica-Bold').fontSize(20).fillColor(BRAND).text('CareSaath', wordX, markTop - 1);
    pdf.font('Helvetica').fontSize(9.5).fillColor(MUTED).text('Home nursing & physiotherapy', wordX, markTop + 23);
    pdf
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(INK)
      .text(pdfSafe(receipt.title), LEFT, markTop - 1, { width: RIGHT - LEFT, align: 'right' });
    pdf
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(`No. ${pdfSafe(receipt.receiptNumber)}`, LEFT, markTop + 20, { width: RIGHT - LEFT, align: 'right' })
      .text(`Issued ${formatDateTime(receipt.issuedAt)}`, LEFT, markTop + 33, { width: RIGHT - LEFT, align: 'right' });
    pdf.moveTo(LEFT, 102).lineTo(RIGHT, 102).strokeColor(BORDER).lineWidth(1).stroke();

    let y = 124;
    const ensureRoom = (needed: number) => {
      if (y + needed > FOOTER_Y - 14) {
        drawFooter();
        pdf.addPage();
        pdf.rect(0, 0, PAGE_W, 6).fill(BRAND);
        y = 50;
      }
    };

    for (const section of receipt.sections) {
      ensureRoom(46);
      pdf
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(BRAND)
        .text(section.heading.toUpperCase(), LEFT, y, { characterSpacing: 0.8 });
      y += 15;
      pdf.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(RULE).lineWidth(1).stroke();
      y += 9;
      section.lines.forEach((line, i) => {
        const value = pdfSafe(line.value);
        const label = pdfSafe(line.label);
        pdf.font('Helvetica').fontSize(10.5);
        const height = Math.max(
          pdf.heightOfString(label, { width: VALUE_X - LEFT - 12 }),
          pdf.heightOfString(value, { width: RIGHT - VALUE_X }),
        );
        ensureRoom(height + 9);
        // Subtle zebra band for even rows improves readability on long receipts.
        if (i % 2 === 0) {
          pdf.rect(LEFT - 6, y - 4, RIGHT - LEFT + 12, height + 8).fill('#fafafa');
        }
        pdf.font('Helvetica').fontSize(10.5).fillColor(MUTED).text(label, LEFT, y, { width: VALUE_X - LEFT - 12 });
        pdf
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .fillColor(INK)
          .text(value, VALUE_X, y, { width: RIGHT - VALUE_X, align: 'right' });
        y += height + 8;
      });
      y += 16;
    }

    if (receipt.total) {
      ensureRoom(66);
      pdf.roundedRect(LEFT, y, RIGHT - LEFT, 50, 8).fill(BRAND);
      pdf
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(WHITE)
        .text(pdfSafe(receipt.total.label), LEFT + 18, y + 18, { width: 250 });
      pdf
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor(WHITE)
        .text(pdfSafe(receipt.total.value), LEFT + 200, y + 15, { width: RIGHT - LEFT - 218, align: 'right' });
      y += 66;
      // A reassuring confirmation strip under the total.
      pdf
        .roundedRect(LEFT, y, RIGHT - LEFT, 26, 6)
        .fill(BRAND_SOFT);
      pdf
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(BRAND)
        .text('Thank you for choosing CareSaath.', LEFT, y + 8, {
          width: RIGHT - LEFT,
          align: 'center',
        });
      y += 26;
    }

    drawFooter();
    pdf.end();
  });
}
