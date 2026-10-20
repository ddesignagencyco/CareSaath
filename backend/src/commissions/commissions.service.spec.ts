import { beforeEach, describe, expect, it } from 'vitest';
import { CommissionsService } from './commissions.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { createAuditMock, createPrismaMock } from '../../test/test-helpers.js';

const admin: AuthUser = { sub: 'u-admin', role: 'ADMIN', phone: '+923000000000' };

describe('CommissionsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: CommissionsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new CommissionsService(prisma as never, createAuditMock() as never);
  });

  it('lists all commission rates', async () => {
    prisma.commissionRate.findMany.mockResolvedValue([{ category: 'NURSING', percentage: 20 }]);
    const result = await service.list();
    expect(result).toHaveLength(1);
    expect(prisma.commissionRate.findMany).toHaveBeenCalledWith({
      orderBy: { category: 'asc' },
    });
  });

  it('upserts a category rate and resets the effective date', async () => {
    prisma.commissionRate.upsert.mockResolvedValue({ id: 'cr-1', percentage: 25 });
    const result = await service.upsert(admin, 'NURSING' as never, { percentage: 25 });
    expect(result).toMatchObject({ percentage: 25 });
    const arg = prisma.commissionRate.upsert.mock.calls[0][0] as {
      where: { category: string };
      update: { percentage: number; effectiveFrom: Date };
      create: { category: string; percentage: number };
    };
    expect(arg.where).toEqual({ category: 'NURSING' });
    expect(arg.update.percentage).toBe(25);
    expect(arg.update.effectiveFrom).toBeInstanceOf(Date);
    expect(arg.create).toEqual({ category: 'NURSING', percentage: 25 });
  });
});
