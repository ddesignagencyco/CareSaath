import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { StorageService } from './storage.module.js';

describe('StorageService (in-memory fallback)', () => {
  const storage = new StorageService();

  it('derives raw for PDFs and image for everything else', () => {
    expect(storage.resourceTypeFor('caregivers/cg-1/docs/1-cnic.pdf')).toBe('raw');
    expect(storage.resourceTypeFor('caregivers/cg-1/docs/1-cnic.PDF')).toBe('raw');
    expect(storage.resourceTypeFor('caregivers/cg-1/photo/1-me.png')).toBe('image');
  });

  it('gives PDFs a .pdf key even when the filename has no extension', async () => {
    const stored = await storage.put('docs', 'scan', Buffer.from('x'), 'application/pdf');
    expect(stored.fileKey.endsWith('.pdf')).toBe(true);
  });

  it('accepts only images for photos', () => {
    expect(() => storage.validateImageUpload('image/png', 10)).not.toThrow();
    expect(() => storage.validateImageUpload('application/pdf', 10)).toThrow(BadRequestException);
  });
});
