import { beforeEach, describe, expect, it } from 'vitest';
import { AdminCallLogsService } from './call-logs.module.js';
import { createPrismaMock, wireTransaction } from '../../test/test-helpers.js';

describe('AdminCallLogsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AdminCallLogsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    service = new AdminCallLogsService(prisma as never);
  });

  it('lists calls newest first', async () => {
    prisma.callLog.count.mockResolvedValue(1);
    prisma.callLog.findMany.mockResolvedValue([{ id: 'call-1' }]);
    const result = await service.list({ page: 1, limit: 20 });
    expect(result).toEqual({ items: [{ id: 'call-1' }], page: 1, limit: 20, total: 1 });
    expect(prisma.callLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { startedAt: 'desc' } }),
    );
  });

  it('filters by visitId', async () => {
    prisma.callLog.count.mockResolvedValue(0);
    prisma.callLog.findMany.mockResolvedValue([]);
    await service.list({ visitId: 'v-1', page: 1, limit: 20 });
    expect(prisma.callLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { visitId: 'v-1' } }),
    );
  });
});
