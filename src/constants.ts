import { SharedCacheStatus } from './types';

/**
 * HTTP header name for cache status information.
 * This non-standard header is used to communicate cache hit/miss status.
 */
export const CACHE_STATUS_HEADERS_NAME = 'x-cache-status';

/**
 * Cache status constants as defined in HTTP caching specifications.
 * These represent the various states of cache operations.
 */

/** Response served from cache without validation */
export const HIT: SharedCacheStatus = 'HIT';

/** Response not found in cache, fetched from origin */
export const MISS: SharedCacheStatus = 'MISS';

/** Cached response was expired, fresh response fetched */
export const EXPIRED: SharedCacheStatus = 'EXPIRED';

/** Stale response served (e.g., during stale-while-revalidate) */
export const STALE: SharedCacheStatus = 'STALE';

/** Cache was bypassed due to cache-control directives */
export const BYPASS: SharedCacheStatus = 'BYPASS';

/** Cached response was revalidated and determined still fresh */
export const REVALIDATED: SharedCacheStatus = 'REVALIDATED';

/** Response is dynamic and cannot be cached */
export const DYNAMIC: SharedCacheStatus = 'DYNAMIC';
