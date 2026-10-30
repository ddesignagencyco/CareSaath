import { describe, expect, it } from 'vitest';
import { DisputesService } from './disputes.module.js';
import { createAuditMock, createNotificationsMock, createPrismaMock, wireTransaction } from '../../test/test-helpers.js';

const user = { sub: 'u-1', role: 'CUSTOMER', phone: '+92' } as never;

function makeService() {
  const prisma = createPrismaMock();
  wireTransaction(prisma);
  prisma.dispute.findMany.mockResolvedValue([{ id: 'd-1' }]);
  prisma.dispute.count.mockResolvedValue(1);
  return { prisma, service: new DisputesService(prisma as never, createAuditMock() as never, createNotificationsMock() as never) };
}

describe('DisputesService.listMine', () => {
  it('keeps the legacy plain array without page/limit', async () => {
    const { service } = makeService();
    await expect(service.listMine(user)).resolves.toEqual([{ id: 'd-1' }]);
  });

  it('returns Paginated with page/limit and applies status + q', async () => {
    const { service, prisma } = makeService();
    const result = await service.listMine(user, { page: 2, limit: 5, status: 'OPEN' as never, q: 'late' });
    expect(result).toEqual({ items: [{ id: 'd-1' }], page: 2, limit: 5, total: 1 });
    const args = prisma.dispute.findMany.mock.calls[0]![0];
    expect(args).toMatchObject({ skip: 5, take: 5 });
    expect(args.where.AND).toHaveLength(3);
  });
});
