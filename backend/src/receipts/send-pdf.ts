import type { Response } from 'express';

export interface PdfFile {
  filename: string;
  pdf: Buffer;
}

/** Send a generated PDF as a download (or inline for an in-app viewer). */
export function sendPdf(res: Response, file: PdfFile, inline = false): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${file.filename}"`);
  res.setHeader('Content-Length', String(file.pdf.length));
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(file.pdf);
}
