import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './http-exception.filter.js';

const captureServerException = vi.hoisted(() => vi.fn());

vi.mock('../observability/sentry.js', () => ({ captureServerException }));

function createHost(overrides: Record<string, unknown> = {}) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const request = {
    method: 'GET',
    url: '/api/v1/customer/bookings',
    path: '/api/v1/customer/bookings',
    id: 'req-1',
    user: { sub: 'u-1', role: 'CUSTOMER' },
    ...overrides,
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a consistent envelope and reports unhandled errors', () => {
    const error = new Error('db exploded');
    const { host, status, json } = createHost();

    new AllExceptionsFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        error: 'InternalServerError',
        message: 'Internal server error',
        path: '/api/v1/customer/bookings',
        requestId: 'req-1',
      }),
    );
    expect(captureServerException).toHaveBeenCalledWith(error, {
      requestId: 'req-1',
      method: 'GET',
      path: '/api/v1/customer/bookings',
      userId: 'u-1',
      role: 'CUSTOMER',
    });
  });

  it('does not report expected 4xx client errors', () => {
    const error = new BadRequestException('bad input');
    const { host, status } = createHost();

    new AllExceptionsFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(captureServerException).not.toHaveBeenCalled();
  });

  it('reports 5xx HttpExceptions', () => {
    const error = new ServiceUnavailableException('dependency down');
    const { host, status } = createHost();

    new AllExceptionsFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(503);
    expect(captureServerException).toHaveBeenCalledWith(error, expect.any(Object));
  });
});
