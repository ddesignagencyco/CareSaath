import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { StorageService, withFileUrl } from './storage.module.js';

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

  it('drops the extension from image ids but keeps plain names intact', async () => {
    const withExt = await storage.put('p', 'photo.png', Buffer.from('x'), 'image/png');
    const noExt = await storage.put('p', 'scan', Buffer.from('x'), 'image/png');
    expect(withExt.fileKey).toMatch(/-photo$/);
    expect(noExt.fileKey).toMatch(/-scan$/);
  });

  it('accepts only images for photos', () => {
    expect(() => storage.validateImageUpload('image/png', 10)).not.toThrow();
    expect(() => storage.validateImageUpload('application/pdf', 10)).toThrow(BadRequestException);
  });
});

describe('withFileUrl', () => {
  it('adds a viewable url to a stored-file record', async () => {
    const storage = { presignedGet: async (key: string) => `https://files.test/${key}` };
    const result = await withFileUrl(storage, { id: 'd-1', fileKey: 'caregivers/cg/docs/1-cnic.pdf' });
    expect(result).toEqual({
      id: 'd-1',
      fileKey: 'caregivers/cg/docs/1-cnic.pdf',
      url: 'https://files.test/caregivers/cg/docs/1-cnic.pdf',
    });
  });

  it('returns url null instead of failing the response when a URL cannot be built', async () => {
    const storage = { presignedGet: () => Promise.reject(new Error('boom')) };
    await expect(withFileUrl(storage, { fileKey: 'k' })).resolves.toEqual({ fileKey: 'k', url: null });
  });
});
