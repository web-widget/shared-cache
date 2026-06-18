import { appendVaryKeySuffix, parseVaryHeader } from './key';
import { vary as appendVaryResponseHeader } from './utils/vary';
import { cacheControl } from './utils/control';
import {
  applyCacheStatus,
  encodeCacheKeyHeaderValue,
  modifyResponseHeaders,
  setResponseHeader,
} from './utils/response';
import { invokeOrigin } from './origin';
import { SharedCache } from './cache';
import { CACHE_KEY_HEADER_NAME, BYPASS, DYNAMIC, HIT, MISS } from './constants';
import type {
  CacheHandler,
  CacheOriginHandler,
  CacheResolveOptions,
  SharedCacheRequest,
} from './types';

/**
 * Sets cache key header on a response for debugging.
 *
 */
function setCacheKey(response: Response, cacheKey?: string): Response {
  if (cacheKey) {
    return setResponseHeader(
      response,
      CACHE_KEY_HEADER_NAME,
      encodeCacheKeyHeaderValue(cacheKey)
    );
  }
  return response;
}

/**
 * Applies Cache-Control and Vary overrides on successful origin responses.
 *
 * Header overrides are only applied when `response.ok` is true to avoid
 * interfering with error handling.
 *
 */
function applyResponseHeaderOverrides(
  response: Response,
  cacheControlOverride: string | undefined,
  varyOverride: string | undefined
): Response {
  if (response.ok && (cacheControlOverride || varyOverride)) {
    return modifyResponseHeaders(response, (headers) => {
      // Override Cache-Control header if specified
      if (cacheControlOverride) {
        cacheControl(headers, cacheControlOverride);
      }

      // Override Vary header if specified
      if (varyOverride) {
        appendVaryResponseHeader(headers, varyOverride);
      }
    });
  }

  return response;
}

async function appendDebugCacheKey(
  request: Request,
  baseKey: string | undefined,
  response: Response,
  ignoreVary: boolean | undefined
): Promise<string | undefined> {
  if (!baseKey || ignoreVary) {
    return baseKey;
  }

  const varyHeader = response.headers.get('vary');
  if (!varyHeader || varyHeader === '*') {
    return baseKey;
  }

  return appendVaryKeySuffix(request, baseKey, parseVaryHeader(varyHeader));
}

/**
 * Determines if a response should bypass the cache based on Cache-Control directives.
 *
 * This follows RFC 7234 Section 5.2 and best practices for shared cache implementations.
 *
 */
function bypassCache(cacheControlHeader: string): boolean {
  const normalized = cacheControlHeader.toLowerCase();

  return (
    normalized.includes('no-store') || // Must not store
    normalized.includes('no-cache') || // Must revalidate
    normalized.includes('private') || // Not for shared caches
    normalized.includes('s-maxage=0') || // Shared cache max-age is 0
    // max-age=0 only if no s-maxage directive exists (shared cache priority)
    (!normalized.includes('s-maxage') && normalized.includes('max-age=0'))
  );
}

/**
 * Resolves a request through shared cache using an in-process origin handler.
 *
 * @remarks
 * Origin error contract:
 * - **miss**: throws propagate to the caller (framework `onError`).
 * - **revalidate**: throws are converted to 5xx responses for `stale-if-error`.
 *
 * @throws When the origin throws during a cache miss.
 */
export async function resolveWithCache(
  cache: SharedCache,
  request: SharedCacheRequest,
  origin: CacheOriginHandler,
  options: CacheResolveOptions = {}
): Promise<Response> {
  const sharedCacheOptions = (request.sharedCache = {
    ignoreRequestCacheControl: true,
    ignoreVary: false,
    ...options,
    ...request.sharedCache,
  });

  const debugCacheKey = sharedCacheOptions.debugCacheKey
    ? await cache.getCacheKey(request)
    : undefined;

  const cacheControlOverride = sharedCacheOptions.cacheControlOverride;
  const varyOverride = sharedCacheOptions.varyOverride;
  const outerSignal = options.signal;

  // Origin fetcher used by cache.match during revalidation and stale-while-revalidate.
  const revalidateFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const revalidationRequest = new Request(input, init);
    const response = await invokeOrigin(origin, revalidationRequest, {
      phase: 'revalidate',
      // NOTE: Propagate the outer abort signal so middleware can terminate revalidation.
      signal: revalidationRequest.signal ?? outerSignal,
      revalidationRequest,
    });
    return applyResponseHeaderOverrides(
      response,
      cacheControlOverride,
      varyOverride
    );
  };

  // Create event from waitUntil function if event is not provided but waitUntil is
  const event =
    sharedCacheOptions.event ||
    (sharedCacheOptions.waitUntil
      ? ({
          waitUntil: sharedCacheOptions.waitUntil,
        } as ExtendableEvent)
      : undefined);

  // Attempt to serve from cache
  const cachedResponse = await cache.match(request, {
    _fetch: revalidateFetch,
    _ignoreRequestCacheControl: sharedCacheOptions.ignoreRequestCacheControl,
    _event: event,
    ignoreMethod: request.method === 'HEAD', // HEAD requests can match GET
  });

  // Return cached response if available
  if (cachedResponse) {
    const effectiveCacheKey = debugCacheKey
      ? await appendDebugCacheKey(
          request,
          debugCacheKey,
          cachedResponse,
          sharedCacheOptions.ignoreVary
        )
      : debugCacheKey;
    return setCacheKey(
      applyCacheStatus(cachedResponse, HIT, { copy: true }),
      effectiveCacheKey
    );
  }

  // Fetch from origin on cache miss and attempt to cache
  const fetchedResponse = applyResponseHeaderOverrides(
    await invokeOrigin(origin, request, {
      phase: 'miss',
      signal: outerSignal ?? request.signal,
    }),
    cacheControlOverride,
    varyOverride
  );

  // Process response caching based on Cache-Control directives
  const responseCacheControl = fetchedResponse.headers.get('cache-control');

  if (responseCacheControl) {
    // Check if response should bypass cache
    if (bypassCache(responseCacheControl)) {
      return setCacheKey(
        applyCacheStatus(fetchedResponse, BYPASS, { copy: true }),
        debugCacheKey
      );
    }

    // Attempt to store in cache
    const cacheSuccess = await cache.put(request, fetchedResponse).then(
      () => true,
      () => false
    );
    const effectiveCacheKey =
      cacheSuccess && debugCacheKey
        ? await appendDebugCacheKey(
            request,
            debugCacheKey,
            fetchedResponse,
            sharedCacheOptions.ignoreVary
          )
        : debugCacheKey;
    return setCacheKey(
      applyCacheStatus(fetchedResponse, cacheSuccess ? MISS : DYNAMIC, {
        copy: true,
      }),
      effectiveCacheKey
    );
  }

  // No Cache-Control header - mark as dynamic content
  return setCacheKey(
    applyCacheStatus(fetchedResponse, DYNAMIC, { copy: true }),
    debugCacheKey
  );
}

/**
 * Creates a reusable cache resolver for middleware-style origin handlers.
 *
 * Prefer this over `createFetch` when the origin is an in-process handler such as
 * middleware `next()` rather than an outbound HTTP `fetch`.
 */
export function createCacheHandler(
  cache: SharedCache,
  defaults: CacheResolveOptions = {}
): CacheHandler {
  return {
    resolve(request, origin, options = {}) {
      return resolveWithCache(cache, request as SharedCacheRequest, origin, {
        ...defaults,
        ...options,
      });
    },
  };
}
