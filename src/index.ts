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

// Type definitions
export type {
  KVStorage,
  SharedCacheFetch as Fetch,
  SharedCacheOptions as CacheOptions,
  SharedCacheQueryOptions as CacheQueryOptions,
  SharedCacheRequestInitProperties as RequestInitProperties,
  SharedCacheStatus as CacheStatus,
} from './types';

// Cache key types
export type {
  FilterOptions,
  SharedCacheKeyRules as CacheKeyRules,
  SharedCacheKeyPartDefiners as CacheKeyPartDefiners,
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
