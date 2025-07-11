/**
 * @fileoverview Main entry point for the @web-widget/shared-cache package.
 *
 * This module provides HTTP-compliant shared caching functionality with support for:
 * - RFC 7234 HTTP caching semantics
 * - Multi-tenant cache storage
 * - Configurable cache key generation
 * - Stale-while-revalidate patterns
 * - Custom storage backends
 *
 * @example
 * ```typescript
 * import { Cache, CacheStorage, createFetch } from '@web-widget/shared-cache';
 *
 * // Create cache storage with custom backend
 * const storage = new MyKVStorage();
 * const cacheStorage = new CacheStorage(storage);
 *
 * // Open named cache
 * const cache = await cacheStorage.open('api-v1');
 *
 * // Create fetch with caching and default configuration
 * const fetch = createFetch(cache, {
 *   defaults: {
 *     cacheControlOverride: 's-maxage=300',
 *     cacheKeyRules: {
 *       header: { include: ['x-user-id'] }
 *     }
 *   }
 * });
 * const response = await fetch('/api/data', { headers: { 'x-user-id': '123' } });
 * ```
 */

export { SharedCache as Cache } from './cache';
export { SharedCacheStorage as CacheStorage } from './cache-storage';

// Fetch integration
export {
  createSharedCacheFetch as createFetch,
  sharedCacheFetch as fetch,
} from './fetch';

// Cache key utilities
export {
  createCacheKeyGenerator,
  DEFAULT_CACHE_KEY_RULES,
  filter,
  cookie,
  device,
  header,
  host,
  pathname,
  search,
  vary,
  CANNOT_INCLUDE_HEADERS,
} from './cache-key';

// Logger utilities
export {
  createLogger,
  createSharedCacheLogger,
  StructuredLogger,
  SharedCacheLogger, // backward compatibility alias
  LogLevel,
} from './utils/logger';

// Type definitions
export type {
  KVStorage,
  SharedCacheLogContext,
  SharedCacheFetch,
  SharedCacheOptions,
  SharedCacheQueryOptions,
  SharedCacheRequestInitProperties,
  SharedCacheStatus,
} from './types';

export type { Logger } from './utils/logger';

// Cache key types
export type {
  FilterOptions,
  SharedCacheKeyRules,
  SharedCacheKeyPartDefiners,
} from './cache-key';

// Constants
export {
  BYPASS,
  CACHE_STATUS_HEADERS_NAME,
  DYNAMIC,
  EXPIRED,
  HIT,
  MISS,
  REVALIDATED,
  STALE,
} from './constants';
