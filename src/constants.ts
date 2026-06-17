/**
 * HTTP header names and cache-status values for SharedCache.
 *
 * Cache-key domain constants (`DEFAULT_CACHE_KEY_RULES`, `CANNOT_INCLUDE_HEADERS`)
 * live in `key.ts` and are re-exported from the package entry.
 */

/** HTTP header name for cache status information. */
export const CACHE_STATUS_HEADER_NAME = 'x-cache-status';

/** HTTP header name for debugging cache key information. */
export const CACHE_KEY_HEADER_NAME = 'x-cache-key';

/** Canonical cache status literals. */
export const SHARED_CACHE_STATUS = {
  /** Response served from cache without validation */
  HIT: 'HIT',
  /** Response not found in cache, fetched from origin */
  MISS: 'MISS',
  /** Cached response was expired, fresh response fetched */
  EXPIRED: 'EXPIRED',
  /** Stale response served when origin is unreachable (stale-if-error) */
  STALE: 'STALE',
  /** Expired response served while revalidating in the background */
  UPDATING: 'UPDATING',
  /** Cache was bypassed due to cache-control directives */
  BYPASS: 'BYPASS',
  /** Cached response was revalidated and determined still fresh */
  REVALIDATED: 'REVALIDATED',
  /** Response is dynamic and cannot be cached */
  DYNAMIC: 'DYNAMIC',
} as const;

/** Cache status values as defined in HTTP caching standards. */
export type CacheStatus =
  (typeof SHARED_CACHE_STATUS)[keyof typeof SHARED_CACHE_STATUS];

export const HIT = SHARED_CACHE_STATUS.HIT;
export const MISS = SHARED_CACHE_STATUS.MISS;
export const EXPIRED = SHARED_CACHE_STATUS.EXPIRED;
export const STALE = SHARED_CACHE_STATUS.STALE;
export const UPDATING = SHARED_CACHE_STATUS.UPDATING;
export const BYPASS = SHARED_CACHE_STATUS.BYPASS;
export const REVALIDATED = SHARED_CACHE_STATUS.REVALIDATED;
export const DYNAMIC = SHARED_CACHE_STATUS.DYNAMIC;
