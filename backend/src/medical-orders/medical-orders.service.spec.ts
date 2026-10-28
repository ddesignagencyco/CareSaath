import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MedicalOrdersService } from './medical-orders.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { createAuditMock, createNotificationsMock, createPrismaMock } from '../../test/test-helpers.js';

const doctor: AuthUser = { sub: 'u-doctor', role: 'CAREGIVER', phone: '+923000000001' };
const nurse: AuthUser = { sub: 'u-nurse', role: 'CAREGIVER', phone: '+923000000002' };
const customer: AuthUser = { sub: 'u-cust', role: 'CUSTOMER', phone: '+923000000003' };

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = createPrismaMock();
  Object.assign(prisma, overrides);
  const audit = createAuditMock();
  const notifications = createNotificationsMock();
  const realtime = { entityUpdated: vi.fn() };
  const service = new MedicalOrdersService(prisma as never, audit as never, notifications as never, realtime as never);
  return { service, prisma, audit, notifications, realtime };
}

describe('MedicalOrdersService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a non-doctor caregiver (e.g. a nurse)', async () => {
    const { service, prisma } = makeService();
    prisma.caregiverProfile.findUnique.mockResolvedValue({
      id: 'cg-nurse',
      specialty: 'NURSING',
      verificationStatus: 'APPROVED',
    });
    await expect(
      service.create(nurse, 'v-1', { diagnosis: 'Flu', medicines: [], labTests: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a doctor who is not yet verified', async () => {
    const { service, prisma } = makeService();
    prisma.caregiverProfile.findUnique.mockResolvedValue({
      id: 'cg-doc',
      specialty: 'DOCTOR',
      verificationStatus: 'PENDING',
    });
    await expect(service.create(doctor, 'v-1', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a visit the doctor is not assigned to', async () => {
    const { service, prisma } = makeService();
    prisma.caregiverProfile.findUnique.mockResolvedValue({
      id: 'cg-doc',
      specialty: 'DOCTOR',
      verificationStatus: 'APPROVED',
    });
    prisma.visit.findFirst.mockResolvedValue(null);
    await expect(service.create(doctor, 'v-1', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates the order and notifies the customer', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.caregiverProfile.findUnique.mockResolvedValue({
      id: 'cg-doc',
      specialty: 'DOCTOR',
      verificationStatus: 'APPROVED',
    });
    prisma.visit.findFirst.mockResolvedValue({
      id: 'v-1',
      booking: { patientId: 'pat-1', customerId: 'cust-1' },
    });
    prisma.medicalOrder.create.mockResolvedValue({ id: 'mo-1', visitId: 'v-1' });

    const result = await service.create(doctor, 'v-1', {
      diagnosis: 'Flu',
      medicines: [{ name: 'Paracetamol' }],
      labTests: [],
    });

    expect(result).toMatchObject({ id: 'mo-1' });
    expect(prisma.medicalOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ visitId: 'v-1', doctorId: 'cg-doc', patientId: 'pat-1', diagnosis: 'Flu' }),
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'cust-1', event: 'medical_order.created' }),
    );
  });
});

describe('MedicalOrdersService.listForVisit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows the customer who owns the visit', async () => {
    const { service, prisma } = makeService();
    prisma.visit.findFirst.mockResolvedValue({ id: 'v-1', booking: {} });
    prisma.medicalOrder.findMany.mockResolvedValue([{ id: 'mo-1' }]);
    await expect(service.listForVisit(customer, 'v-1')).resolves.toEqual([{ id: 'mo-1' }]);
  });

  it('rejects a customer who does not own the visit', async () => {
    const { service, prisma } = makeService();
    prisma.visit.findFirst.mockResolvedValue(null);
    await expect(service.listForVisit(customer, 'v-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
