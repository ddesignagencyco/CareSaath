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
const MUTED = '#6b7280';
const INK = '#111827';
const LEFT = 50;
const VALUE_X = 230;
const RIGHT = 545;

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

    // Header
    pdf.font('Helvetica-Bold').fontSize(24).fillColor(BRAND).text('CareSaath', LEFT, 50);
    pdf.font('Helvetica').fontSize(11).fillColor(MUTED).text('Home nursing and physiotherapy', LEFT, 78);
    pdf
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(INK)
      .text(pdfSafe(receipt.title), LEFT, 50, { width: RIGHT - LEFT, align: 'right' });
    pdf
      .font('Helvetica')
      .fontSize(10)
      .fillColor(MUTED)
      .text(`No. ${pdfSafe(receipt.receiptNumber)}`, LEFT, 72, { width: RIGHT - LEFT, align: 'right' })
      .text(`Issued ${formatDateTime(receipt.issuedAt)}`, LEFT, 86, { width: RIGHT - LEFT, align: 'right' });
    pdf.moveTo(LEFT, 112).lineTo(RIGHT, 112).strokeColor('#d1d5db').lineWidth(1).stroke();

    let y = 130;
    const ensureRoom = (needed: number) => {
      if (y + needed > 760) {
        pdf.addPage();
        y = 50;
      }
    };

    for (const section of receipt.sections) {
      ensureRoom(40);
      pdf.font('Helvetica-Bold').fontSize(10).fillColor(BRAND).text(section.heading.toUpperCase(), LEFT, y);
      y += 18;
      for (const line of section.lines) {
        const value = pdfSafe(line.value);
        pdf.font('Helvetica').fontSize(10.5);
        const height = Math.max(
          pdf.heightOfString(pdfSafe(line.label), { width: VALUE_X - LEFT - 10 }),
          pdf.heightOfString(value, { width: RIGHT - VALUE_X }),
        );
        ensureRoom(height + 8);
        pdf.fillColor(MUTED).text(pdfSafe(line.label), LEFT, y, { width: VALUE_X - LEFT - 10 });
        pdf.fillColor(INK).text(value, VALUE_X, y, { width: RIGHT - VALUE_X });
        y += height + 6;
      }
      y += 10;
    }

    if (receipt.total) {
      ensureRoom(60);
      pdf.roundedRect(LEFT, y, RIGHT - LEFT, 44, 6).fill('#ecfdf5');
      pdf
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(BRAND)
        .text(pdfSafe(receipt.total.label), LEFT + 14, y + 15, { width: 250 });
      pdf
        .fontSize(16)
        .fillColor(INK)
        .text(pdfSafe(receipt.total.value), LEFT + 200, y + 13, { width: RIGHT - LEFT - 214, align: 'right' });
      y += 60;
    }

    pdf
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(
        pdfSafe(receipt.footer ?? 'This is a computer-generated receipt and needs no signature.'),
        LEFT,
        780,
        { width: RIGHT - LEFT, align: 'center' },
      );
    pdf.end();
  });
}
