import { cacheControl, vary } from '@web-widget/helpers/headers';
import { SharedCache } from './cache';
import { SharedCacheStorage } from './cache-storage';
import {
  BYPASS,
  CACHE_STATUS_HEADERS_NAME,
  DYNAMIC,
  HIT,
  MISS,
} from './constants';
import { SharedCacheStatus, SharedCacheFetch } from './types';

/** Reference to the original global fetch function */
const ORIGINAL_FETCH = globalThis.fetch;

/**
 * Creates a fetch function with shared caching capabilities.
 *
 * This function implements HTTP caching semantics on top of the standard fetch API,
 * providing automatic cache management with support for:
 * - HTTP cache semantics (RFC 7234)
 * - Conditional requests and revalidation
 * - Stale-while-revalidate patterns
 * - Custom cache control and vary header overrides
 *
 * The returned fetch function is compatible with the standard fetch API while
 * adding transparent caching capabilities.
 *
 * @param cache - Optional SharedCache instance (defaults to global cache if available)
 * @param options - Configuration options
 * @param options.fetch - Custom fetch implementation (defaults to global fetch)
 * @returns A fetch function with caching capabilities
 *
 * @example
 * ```typescript
 * const cachedFetch = createSharedCacheFetch(myCache);
 * const response = await cachedFetch('/api/data');
 * ```
 */
export function createSharedCacheFetch(
  cache?: SharedCache,
  options?: {
    /** Custom fetch implementation to use as the underlying fetcher */
    fetch?: typeof fetch;
  }
): SharedCacheFetch {
  const fetcher = options?.fetch ?? ORIGINAL_FETCH;
  return async function fetch(input, init) {
    // Auto-discover cache from global caches if not provided
    if (!cache && globalThis.caches instanceof SharedCacheStorage) {
      cache = await globalThis.caches.open('default');
    }

    // Validate cache availability
    if (!cache) {
      throw new TypeError(
        'SharedCache is required. Provide a cache instance or ensure globalThis.caches is available.'
      );
    }

    // Create request object with proper initialization
    const request = new Request(input, init);

    // Extract and validate cache mode
    const requestCache = getRequestCacheMode(request, init?.cache);

    // Configure shared cache options with defaults
    const sharedCacheOptions = (request.sharedCache = {
      ignoreRequestCacheControl: true, // Default: ignore client cache directives
      ignoreVary: false, // Default: respect Vary header
      ...request.sharedCache, // Existing request options
      ...init?.sharedCache, // Init options override
    });

    // Create interceptor for response header manipulation
    const interceptor = createInterceptor(
      fetcher,
      sharedCacheOptions.cacheControlOverride,
      sharedCacheOptions.varyOverride
    );

    // Validate unsupported cache modes
    if (requestCache && requestCache !== 'default') {
      throw new Error(
        `Cache mode "${requestCache}" is not implemented. Only "default" mode is supported.`
      );
    }

    // Attempt to serve from cache
    const cachedResponse = await cache.match(request, {
      _fetch: interceptor,
      _ignoreRequestCacheControl: sharedCacheOptions.ignoreRequestCacheControl,
      _waitUntil: sharedCacheOptions.waitUntil,
      ignoreMethod: request.method === 'HEAD', // HEAD requests can match GET
    });

    // Return cached response if available
    if (cachedResponse) {
      setCacheStatus(cachedResponse, HIT);
      return cachedResponse;
    }

    // Fetch from network and attempt to cache
    const fetchedResponse = await interceptor(request);
    // Process response caching based on Cache-Control directives
    const cacheControl = fetchedResponse.headers.get('cache-control');

    if (cacheControl) {
      // Check if response should bypass cache
      if (bypassCache(cacheControl)) {
        setCacheStatus(fetchedResponse, BYPASS);
      } else {
        // Attempt to store in cache
        const cacheSuccess = await cache.put(request, fetchedResponse).then(
          () => true,
          () => {
            return false;
          }
        );
        setCacheStatus(fetchedResponse, cacheSuccess ? MISS : DYNAMIC);
      }
    } else {
      // No Cache-Control header - mark as dynamic content
      setCacheStatus(fetchedResponse, DYNAMIC);
    }

    return fetchedResponse;
  };
}

/**
 * Default shared cache fetch instance using global cache.
 *
 * This is a convenience export that creates a shared cache fetch function
 * using the default configuration. It will automatically use the global
 * cache storage if available.
 *
 * @example
 * ```typescript
 * import { sharedCacheFetch } from '@web-widget/shared-cache';
 * const response = await sharedCacheFetch('/api/data');
 * ```
 */
export const sharedCacheFetch = createSharedCacheFetch();

/**
 * Sets cache status header on a response if not already present.
 *
 * This function adds diagnostic information about cache behavior by setting
 * a custom header. The header is only set if it doesn't already exist,
 * preserving any existing cache status information.
 *
 * @param response - The response to modify
 * @param status - The cache status to set
 * @internal
 */
function setCacheStatus(response: Response, status: SharedCacheStatus) {
  const headers = response.headers;
  if (!headers.has(CACHE_STATUS_HEADERS_NAME)) {
    headers.set(CACHE_STATUS_HEADERS_NAME, status);
  }
}

/**
 * Creates an interceptor function that can modify response headers.
 *
 * This function creates a wrapper around the fetch function that allows
 * overriding Cache-Control and Vary headers on successful responses.
 * This is useful for:
 * - Enforcing consistent caching policies
 * - Adding cache directives to responses that lack them
 * - Customizing vary behavior for specific applications
 *
 * Header overrides are only applied to successful responses (response.ok = true)
 * to avoid interfering with error handling.
 *
 * @param fetcher - The underlying fetch function to wrap
 * @param cacheControlOverride - Optional Cache-Control header value to set
 * @param varyOverride - Optional Vary header value to set
 * @returns A fetch function with header modification capabilities
 * @internal
 */
function createInterceptor(
  fetcher: typeof fetch,
  cacheControlOverride: string | undefined,
  varyOverride: string | undefined
): typeof fetch {
  return async function fetch(...args) {
    const response = await fetcher(...args);

    // Only modify headers on successful responses
    if (response.ok) {
      const headers = response.headers;

      // Override Cache-Control header if specified
      if (cacheControlOverride) {
        cacheControl(headers, cacheControlOverride);
      }

      // Override Vary header if specified
      if (varyOverride) {
        vary(headers, varyOverride);
      }
    }

    return response;
  };
}

/**
 * Determines if a response should bypass the cache based on Cache-Control directives.
 *
 * This function implements cache bypass logic according to HTTP caching specifications.
 * A response bypasses the cache if it contains any of the following directives:
 *
 * - `no-store`: Response must not be stored in any cache
 * - `no-cache`: Response must not be served from cache without revalidation
 * - `private`: Response is intended for a single user and shouldn't be stored in shared caches
 * - `s-maxage=0`: Response expires immediately for shared caches
 * - `max-age=0` (without s-maxage): Response expires immediately for all caches
 *
 * This follows RFC 7234 Section 5.2 and best practices for shared cache implementations.
 *
 * @param cacheControlHeader - The Cache-Control header value to analyze
 * @returns True if the response should bypass the cache, false otherwise
 * @internal
 */
function bypassCache(cacheControlHeader: string): boolean {
  const cacheControl = cacheControlHeader.toLowerCase();

  return (
    cacheControl.includes('no-store') || // Must not store
    cacheControl.includes('no-cache') || // Must revalidate
    cacheControl.includes('private') || // Not for shared caches
    cacheControl.includes('s-maxage=0') || // Shared cache max-age is 0
    // max-age=0 only if no s-maxage directive exists (shared cache priority)
    (!cacheControl.includes('s-maxage') && cacheControl.includes('max-age=0'))
  );
}

/**
 * Safely extracts the cache mode from a request object.
 *
 * This function handles environments where the `request.cache` property
 * may not be implemented (e.g., some server-side environments) by falling
 * back to a default cache mode.
 *
 * The cache property is part of the Fetch API specification but may not
 * be available in all JavaScript environments.
 *
 * @param request - The request object to extract cache mode from
 * @param defaultCacheMode - Fallback cache mode if request.cache is not available
 * @returns The request's cache mode or the default if not available
 * @internal
 */
function getRequestCacheMode(
  request: Request,
  defaultCacheMode?: RequestCache
): RequestCache | undefined {
  try {
    // NOTE: In some server environments, request.cache may not be implemented
    // Error: Failed to get the 'cache' property on 'Request': the property is not implemented.
    return request.cache;
  } catch (error) {
    // Fallback to default if property access fails
    return defaultCacheMode;
  }
}
