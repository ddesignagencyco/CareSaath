import { vi } from 'vitest';

/**
 * Minimal fake PrismaService with vi.fn() stubs. Each call returns a fresh
 * object so tests can override individual methods without cross-talk.
 */
export function createPrismaMock() {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
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
    caregiverServiceArea: model(),
    booking: model(),
    visit: model(),
    visitStatusHistory: model(),
    visitNote: model(),
    prescriptionDocument: model(),
    review: model(),
    safetyIncident: model(),
    incidentEvent: model(),
    dispute: model(),
    promoCode: model(),
    notification: model(),
    notificationPreference: model(),
    auditLog: model(),
    platformConfig: model(),
    payment: model(),
    payoutAccount: model(),
    payoutRequest: model(),
    chatMessage: model(),
    messageReaction: model(),
    medicalOrder: model(),
    caregiverStrike: model(),
    callLog: model(),
    // $transaction supports both array form and callback form.
    $transaction: vi.fn(),
  };
}

export function createAuditMock() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

export function createNotificationsMock() {
  return {
    notify: vi.fn().mockResolvedValue(undefined),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
  };
}

/** Config mock resolving every key to a fixed value unless overridden. */
export function createConfigMock(values: Record<string, number> = {}) {
  return {
    getNumber: vi.fn((key: string) => Promise.resolve(values[key] ?? 600)),
  };
}

export function createRedisMock() {
  return {
    client: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      incr: vi.fn().mockResolvedValue(0),
      expire: vi.fn().mockResolvedValue(1),
    },
    deleteByPattern: vi.fn().mockResolvedValue(undefined),
  };
}

export function createSmsMock() {
  return {
    sendOtp: vi.fn().mockResolvedValue(undefined),
    sendVisitAlert: vi.fn().mockResolvedValue(undefined),
  };
}

export function createStorageMock() {
  return {
    validateUpload: vi.fn(),
    validateImageUpload: vi.fn(),
    put: vi.fn(),
    presignedGet: vi.fn().mockResolvedValue('https://storage.local/signed'),
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
