import { describe, expect, it } from 'vitest';
import { AdminAuditLogsService } from './audit-logs.module.js';
import { createPrismaMock, wireTransaction } from '../../test/test-helpers.js';

describe('AdminAuditLogsService', () => {
  it('filters, paginates newest first and flattens the actor name', async () => {
    const prisma = createPrismaMock();
    wireTransaction(prisma);
    const at = new Date();
    prisma.auditLog.count.mockResolvedValue(1);
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'a-1', actorId: 'u-1', action: 'booking.accepted', entityType: 'Booking', entityId: 'b-1', metadata: null, at, actor: { fullName: 'Admin A', role: 'ADMIN' } },
    ]);
    const service = new AdminAuditLogsService(prisma as never);
    const page = await service.list({ entityType: 'Booking', actorId: 'u-1', action: 'booking.', page: 2, limit: 10 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: 'Booking', actorId: 'u-1', action: { startsWith: 'booking.' } },
        orderBy: { at: 'desc' },
        skip: 10,
        take: 10,
      }),
    );
    expect(page).toEqual({
      items: [{ id: 'a-1', actorId: 'u-1', actorName: 'Admin A', actorRole: 'ADMIN', action: 'booking.accepted', entityType: 'Booking', entityId: 'b-1', metadata: null, at }],
      page: 2,
      limit: 10,
      total: 1,
    });
  });
});
