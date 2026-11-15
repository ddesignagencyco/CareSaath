import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { normalizeWhatsAppNumber, WhatsAppService } from './whatsapp.service.js';

describe('normalizeWhatsAppNumber', () => {
  it('converts Pakistani local numbers (03xx) to 923xx', () => {
    expect(normalizeWhatsAppNumber('03152224435')).toBe('923152224435');
    expect(normalizeWhatsAppNumber('03001234567')).toBe('923001234567');
  });

  it('handles international numbers with + prefix', () => {
    expect(normalizeWhatsAppNumber('+923152224435')).toBe('923152224435');
    expect(normalizeWhatsAppNumber('+1 (555) 123-4567')).toBe('15551234567');
  });

  it('prepends 92 if 10 digits without leading 0', () => {
    expect(normalizeWhatsAppNumber('3152224435')).toBe('923152224435');
  });
});

describe('WhatsAppService', () => {
  function createService(configMap: Record<string, string | undefined>) {
    const config = {
      get: vi.fn((key: string) => configMap[key]),
    } as unknown as ConfigService;
    return new WhatsAppService(config);
  }

  it('is not configured if WHATSAPP_ENABLED is not true', () => {
    const service = createService({
      WHATSAPP_ENABLED: 'false',
      WHATSAPP_PHONE_NUMBER_ID: '12345',
      WHATSAPP_ACCESS_TOKEN: 'token',
    });
    expect(service.isConfigured).toBe(false);
  });

  it('is not configured if token or phone id is missing', () => {
    const service = createService({
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_PHONE_NUMBER_ID: '',
      WHATSAPP_ACCESS_TOKEN: 'token',
    });
    expect(service.isConfigured).toBe(false);
  });

  it('is configured when enabled and both phone id and token are provided', () => {
    const service = createService({
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_PHONE_NUMBER_ID: '12345',
      WHATSAPP_ACCESS_TOKEN: 'token',
    });
    expect(service.isConfigured).toBe(true);
  });

  it('returns failure result if not configured without making network call', async () => {
    const service = createService({ WHATSAPP_ENABLED: 'false' });
    const result = await service.sendOtp('+923152224435', '123456');
    expect(result.success).toBe(false);
    expect(result.error).toBe('WHATSAPP_NOT_CONFIGURED');
  });
});
