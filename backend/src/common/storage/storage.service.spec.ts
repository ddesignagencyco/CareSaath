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

describe('StorageService chat media (in-memory fallback)', () => {
  const storage = new StorageService();

  it('derives video for voice/video extensions, raw for pdf, image otherwise', () => {
    expect(storage.resourceTypeFor('bookings/b-1/media/1-note.webm')).toBe('video');
    expect(storage.resourceTypeFor('bookings/b-1/media/1-clip.mp4')).toBe('video');
    expect(storage.resourceTypeFor('bookings/b-1/media/1-receipt.pdf')).toBe('raw');
    expect(storage.resourceTypeFor('bookings/b-1/media/1-photo.png')).toBe('image');
  });

  it('accepts images, pdf, audio, and video, within the larger chat size cap', () => {
    expect(() => storage.validateChatMediaUpload('audio/webm', 20 * 1024 * 1024)).not.toThrow();
    expect(() => storage.validateChatMediaUpload('video/mp4', 20 * 1024 * 1024)).not.toThrow();
    expect(() => storage.validateChatMediaUpload('video/mp4', 30 * 1024 * 1024)).toThrow(BadRequestException);
    expect(() => storage.validateChatMediaUpload('application/zip', 10)).toThrow(BadRequestException);
  });

  it('keeps the extension on voice/video media keys but drops it on images', async () => {
    const voice = await storage.putChatMedia('bookings/b-1/media', 'note.webm', Buffer.from('x'), 'audio/webm');
    const image = await storage.putChatMedia('bookings/b-1/media', 'photo.png', Buffer.from('x'), 'image/png');
    expect(voice.fileKey).toMatch(/-note\.webm$/);
    expect(image.fileKey).toMatch(/-photo$/);
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
