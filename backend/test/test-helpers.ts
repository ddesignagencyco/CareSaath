import { vi } from 'vitest';

/**
 * Minimal fake PrismaService with vi.fn() stubs. Each call returns a fresh
 * object so tests can override individual methods without cross-talk.
 */
export function createPrismaMock() {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  });

  return {
    user: model(),
    otpCode: model(),
    emergencyContact: model(),
    patientProfile: model(),
    address: model(),
    caregiverProfile: model(),
    caregiverDocument: model(),
    credentialReview: model(),
    commissionRate: model(),
    availabilityRule: model(),
    availabilityBlock: model(),
    booking: model(),
    visit: model(),
    visitStatusHistory: model(),
    visitNote: model(),
    review: model(),
    safetyIncident: model(),
    notification: model(),
    auditLog: model(),
    // $transaction supports both array form and callback form.
    $transaction: vi.fn(),
  };
}

export function createAuditMock() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

export function createNotificationsMock() {
  return { notify: vi.fn().mockResolvedValue(undefined) };
}

export function createStorageMock() {
  return {
    validateUpload: vi.fn(),
    put: vi.fn(),
    presignedGet: vi.fn().mockResolvedValue('https://minio.local/signed'),
  };
}

/** Wire $transaction to run array promises or a callback against the same mock. */
export function wireTransaction(prisma: ReturnType<typeof createPrismaMock>) {
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => unknown)(prisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
}
