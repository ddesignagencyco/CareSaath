import * as Sentry from '@sentry/node';

let enabled = false;

export interface ErrorContext {
  requestId?: string;
  method?: string;
  path?: string;
  userId?: string;
  role?: string;
}

/**
 * Initialise Sentry only when a DSN is configured. Nothing here is required for
 * local development or tests, and a bad DSN must never stop the API from
 * booting. Request bodies, cookies and query strings are stripped before send
 * so phone numbers and medical data do not leave the platform.
 */
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  enabled = false;
  const dsn = env['SENTRY_DSN']?.trim();
  if (!dsn) {
    return false;
  }
  const parsedRate = Number(env['SENTRY_TRACES_SAMPLE_RATE'] ?? 0);
  const tracesSampleRate = Number.isFinite(parsedRate)
    ? Math.min(1, Math.max(0, parsedRate))
    : 0;
  try {
    Sentry.init({
      dsn,
      environment:
        env['SENTRY_ENVIRONMENT']?.trim() || env['NODE_ENV']?.trim() || 'development',
      release: env['SENTRY_RELEASE']?.trim() || undefined,
      tracesSampleRate,
      // Keep PHI out of the tracker: no user info, cookies, headers, bodies,
      // query strings, DB parameters or local variables are collected.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        stackFrameVariables: false,
      },
      beforeSend(event) {
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          delete event.request.query_string;
        }
        return event;
      },
    });
    enabled = true;
    return true;
  } catch (error) {
    console.warn(`[sentry] disabled: ${(error as Error).message}`);
    return false;
  }
}

/** Report a 5xx/unknown failure with correlation metadata; never throws. */
export function captureServerException(exception: unknown, context: ErrorContext = {}): void {
  if (!enabled) {
    return;
  }
  try {
    Sentry.withScope((scope) => {
      if (context.requestId) {
        scope.setTag('request_id', context.requestId);
      }
      if (context.method) {
        scope.setTag('http.method', context.method);
      }
      if (context.path) {
        scope.setTag('http.path', context.path);
      }
      if (context.role) {
        scope.setTag('user.role', context.role);
      }
      scope.setUser(context.userId ? { id: context.userId } : null);
      scope.setLevel('error');
      Sentry.captureException(exception);
    });
  } catch {
    // Observability must never fail the request path.
  }
}

export async function closeSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) {
    return;
  }
  try {
    await Sentry.close(timeoutMs);
  } catch {
    // Ignore shutdown errors.
  }
}
