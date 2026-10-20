import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PromosService, computeDiscount } from './promos.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { createAuditMock, createPrismaMock } from '../../test/test-helpers.js';

const admin: AuthUser = { sub: 'u-admin', role: 'ADMIN', phone: '+923000000000' };

describe('computeDiscount', () => {
  it('computes a percentage discount', () => {
    expect(computeDiscount(5000, 'PERCENT' as never, 10)).toBe(500);
  });

  it('computes a fixed discount', () => {
    expect(computeDiscount(5000, 'FIXED' as never, 700)).toBe(700);
  });

  it('never discounts more than the base amount', () => {
    expect(computeDiscount(300, 'FIXED' as never, 5000)).toBe(300);
    expect(computeDiscount(1000, 'PERCENT' as never, 200)).toBe(1000);
  });
});

describe('PromosService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: PromosService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PromosService(prisma as never, createAuditMock() as never);
  });

  it('uppercases the code when creating a promo', async () => {
    prisma.promoCode.findUnique.mockResolvedValue(null);
    prisma.promoCode.create.mockImplementation(async ({ data }: never) => ({ id: 'p-1', ...data }));
    const result = await service.create(admin, {
      code: 'welcome10',
      discountType: 'PERCENT' as never,
      discountValue: 10,
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2026-12-31T00:00:00.000Z',
    });
    expect(result).toMatchObject({ code: 'WELCOME10' });
  });

  it('rejects a duplicate code', async () => {
    prisma.promoCode.findUnique.mockResolvedValue({ id: 'p-1' });
    await expect(
      service.create(admin, {
        code: 'DUP',
        discountType: 'PERCENT' as never,
        discountValue: 10,
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-12-31T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an inactive code', async () => {
    prisma.promoCode.findUnique.mockResolvedValue({
      id: 'p-1',
      active: false,
      discountType: 'PERCENT',
      discountValue: 10,
    });
    await expect(service.quote('CODE', 5000)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a code outside its validity window', async () => {
    prisma.promoCode.findUnique.mockResolvedValue({
      id: 'p-1',
      active: true,
      discountType: 'PERCENT',
      discountValue: 10,
      validFrom: new Date('2020-01-01'),
      validTo: new Date('2020-02-01'),
      maxUses: null,
      usesCount: 0,
    });
    await expect(service.quote('CODE', 5000)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a code past its usage limit', async () => {
    prisma.promoCode.findUnique.mockResolvedValue({
      id: 'p-1',
      active: true,
      discountType: 'FIXED',
      discountValue: 500,
      validFrom: new Date('2020-01-01'),
      validTo: new Date('2999-01-01'),
      maxUses: 5,
      usesCount: 5,
    });
    await expect(service.quote('CODE', 5000)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the promo and computed discount for a valid code', async () => {
    const promo = {
      id: 'p-1',
      active: true,
      discountType: 'PERCENT',
      discountValue: 10,
      validFrom: new Date('2020-01-01'),
      validTo: new Date('2999-01-01'),
      maxUses: null,
      usesCount: 0,
    };
    prisma.promoCode.findUnique.mockResolvedValue(promo);
    const result = await service.quote('code', 5000);
    expect(result.promo.id).toBe('p-1');
    expect(result.discountAmount).toBe(500);
  });

  it('increments uses on redeem', async () => {
    prisma.promoCode.update.mockResolvedValue({});
    await service.redeem('p-1');
    expect(prisma.promoCode.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { usesCount: { increment: 1 } },
    });
  });

  it('404s when updating a missing promo', async () => {
    prisma.promoCode.findUnique.mockResolvedValue(null);
    await expect(service.update(admin, 'p-x', { active: false })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
