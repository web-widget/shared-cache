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

export {
  createSharedCacheFetch as createFetch,
  sharedCacheFetch as fetch,
} from './fetch';

export { createCacheHandler, resolveWithCache } from './resolve';

export {
  createCacheKeyGenerator,
  DEFAULT_CACHE_KEY_RULES,
  CANNOT_INCLUDE_HEADERS,
} from './cache-key';

export {
  createLogger,
  createSharedCacheLogger,
  StructuredLogger,
  SharedCacheLogger, // backward compatibility alias
  LogLevel,
} from './utils/logger';

export type {
  KVStorage,
  SharedCacheLogContext,
  SharedCacheFetch,
  SharedCacheOptions,
  SharedCacheQueryOptions,
  SharedCacheRequestInitProperties,
  SharedCacheStatus,
  CacheOriginPhase,
  CacheOriginContext,
  CacheOriginHandler,
  CacheResolveOptions,
  CacheHandler,
  CacheKeyGenerator,
  FilterOptions,
  SharedCacheKeyRules,
  Logger,
} from './types';

export {
  BYPASS,
  CACHE_KEY_HEADER_NAME,
  CACHE_STATUS_HEADER_NAME,
  DYNAMIC,
  EXPIRED,
  HIT,
  MISS,
  REVALIDATED,
  SHARED_CACHE_STATUS,
  STALE,
  UPDATING,
} from './constants';
