import type { CacheOriginContext, CacheOriginHandler } from './types';

function toAbortError(reason?: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  return new DOMException(
    reason != null ? String(reason) : 'Aborted',
    'AbortError'
  );
}

/**
 * Converts origin failures during revalidation into HTTP 5xx responses.
 *
 * NOTE: Revalidation failures must remain HTTP responses so `stale-if-error`
 * and conditional revalidation can run. Miss-phase failures propagate as throws.
 *
 */
export function toOriginFailureResponse(error: unknown): Response {
  const message =
    error instanceof Error ? error.message : 'Internal Server Error';
  return new Response(message, { status: 500 });
}

function settleOriginFailure(
  phase: CacheOriginContext['phase'],
  error: unknown,
  resolve: (response: Response) => void,
  reject: (error: unknown) => void
): void {
  // NOTE: Miss-phase errors are application failures and must reach framework handlers.
  if (phase === 'miss') {
    reject(error);
    return;
  }
  resolve(toOriginFailureResponse(error));
}

/**
 * Invokes a cache origin with phase-aware error and abort handling.
 *
 */
export async function invokeOrigin(
  origin: CacheOriginHandler,
  request: Request,
  context: CacheOriginContext
): Promise<Response> {
  const { signal, phase } = context;

  if (!signal) {
    try {
      return await origin(request, context);
    } catch (error) {
      if (phase === 'miss') {
        throw error;
      }
      return toOriginFailureResponse(error);
    }
  }

  if (signal.aborted) {
    if (phase === 'miss') {
      throw toAbortError(signal.reason);
    }
    return toOriginFailureResponse(signal.reason);
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      settleOriginFailure(phase, toAbortError(signal.reason), resolve, reject);
    };

    signal.addEventListener('abort', onAbort);

    let result: Response | Promise<Response>;

    try {
      result = origin(request, context);
    } catch (error) {
      signal.removeEventListener('abort', onAbort);
      settleOriginFailure(phase, error, resolve, reject);
      return;
    }

    Promise.resolve(result)
      .then((response) => {
        signal.removeEventListener('abort', onAbort);
        if (signal.aborted) {
          settleOriginFailure(
            phase,
            toAbortError(signal.reason),
            resolve,
            reject
          );
          return;
        }
        resolve(response);
      })
      .catch((error) => {
        signal.removeEventListener('abort', onAbort);
        settleOriginFailure(phase, error, resolve, reject);
      });
  });
}
