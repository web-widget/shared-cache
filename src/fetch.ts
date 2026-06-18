import { SharedCache } from './cache';
import { SharedCacheStorage } from './storage';
import { resolveWithCache } from './resolve';
import {
  SharedCacheFetch,
  SharedCacheRequestInitProperties,
  SharedCacheRequest,
} from './types';

/** Reference to the original global fetch function */
const ORIGINAL_FETCH = globalThis.fetch;

/**
 * Creates a fetch function with shared caching capabilities.
 *
 * This is the internal implementation that powers the `createFetch` export.
 * Users should import and use `createFetch` instead of this function directly.
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
 * @param options.defaults - Default shared cache options to apply to all requests
 * @returns A fetch function with caching capabilities
 *
 * @example
 * ```typescript
 * import { createFetch, CacheStorage } from '@web-widget/shared-cache';
 * import { LRUCache } from 'lru-cache';
 *
 * // Set up cache storage
 * const caches = new CacheStorage(createLRUStorage());
 * const cache = await caches.open('api-cache');
 *
 * // Create cached fetch with default configuration
 * const fetch = createFetch(cache, {
 *   defaults: {
 *     cacheControlOverride: 's-maxage=300',
 *     ignoreRequestCacheControl: true,
 *   }
 * });
 *
 * // Use the cached fetch
 * const response = await fetch('/api/data');
 * console.log(response.headers.get('x-cache-status')); // "MISS" or "HIT"
 * ```
 */
export function createSharedCacheFetch(
  cache?: SharedCache,
  options?: {
    /** Custom fetch implementation to use as the underlying fetcher */
    fetch?: typeof globalThis.fetch;
    /** Default shared cache options to apply to all requests */
    defaults?: Partial<SharedCacheRequestInitProperties>;
  }
): SharedCacheFetch {
  const fetcher = options?.fetch ?? ORIGINAL_FETCH;
  const defaults = options?.defaults ?? {};

  return async function fetch(input, init) {
    // Auto-discover cache from global caches if not provided
    if (!cache && globalThis.caches instanceof SharedCacheStorage) {
      cache = await globalThis.caches.open('default');
    }

    // Validate cache availability
    if (!cache) {
      throw new TypeError(
        'Cache is required. Provide a cache instance or ensure globalThis.caches is available.'
      );
    }

    // Create request object with proper initialization
    const request = new Request(input, init) as SharedCacheRequest;

    // Extract and validate cache mode
    const requestCache = getRequestCacheMode(request, init?.cache);

    // Validate unsupported cache modes
    if (requestCache && requestCache !== 'default') {
      throw new Error(
        `Cache mode "${requestCache}" is not implemented. Only "default" mode is supported.`
      );
    }

    // Configure shared cache options with defaults merged with request options
    const sharedCacheOptions = {
      // Start with global defaults
      ignoreRequestCacheControl: true,
      ignoreVary: false,
      // Apply user-provided defaults
      ...defaults,
      // Apply any existing request options
      ...request.sharedCache,
      // Finally apply init options (highest priority)
      ...init?.sharedCache,
    };

    return resolveWithCache(
      cache,
      request,
      (originRequest) => fetcher(originRequest, init),
      {
        ...sharedCacheOptions,
        signal: init?.signal ?? undefined,
      }
    );
  };
}

/**
 * Default shared cache fetch instance using global cache.
 *
 * This is a convenience export that creates a shared cache fetch function
 * using the default configuration. It will automatically use the global
 * cache storage if available.
 *
 * @deprecated
 */
export const sharedCacheFetch = createSharedCacheFetch();

/**
 * Safely extracts the cache mode from a request object.
 *
 * This function handles environments where the `request.cache` property
 * may not be implemented (e.g., some server-side environments) by falling
 * back to a default cache mode.
 *
 */
function getRequestCacheMode(
  request: Request,
  defaultCacheMode?: RequestCache
): RequestCache | undefined {
  try {
    // NOTE: In some server environments, request.cache may not be implemented
    // Error: Failed to get the 'cache' property on 'Request': the property is not implemented.
    return request.cache;
  } catch (_error) {
    // Fallback to default if property access fails
    return defaultCacheMode;
  }
}

export { createSharedCacheFetch as createFetch, sharedCacheFetch as fetch };
