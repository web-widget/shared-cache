import CachePolicy, {
  CachePolicyObject,
} from '@web-widget/http-cache-semantics';
import { SharedCacheKeyPartDefiners, SharedCacheKeyRules } from './cache-key';

export { SharedCacheKeyRules, SharedCacheKeyPartDefiners };

export interface SharedCacheOptions {
  /**
   * Cache namespace.
   * @private
   */
  _cacheName?: string;

  /**
   * Default cache key rules.
   */
  cacheKeyRules?: SharedCacheKeyRules;

  /**
   * Define custom parts for cache keys.
   */
  cacheKeyPartDefiners?: SharedCacheKeyPartDefiners;

  waitUntil?: (promise: Promise<unknown>) => void;

  /**
   * Method to initiate a request after cache expiration.
   */
  fetch?: typeof fetch;

  /**
   * Custom logger.
   */
  logger?: Logger;
}

export interface Logger {
  info(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

export interface KVStorage {
  get: (cacheKey: string) => Promise<unknown | undefined>;
  set: (cacheKey: string, value: unknown, ttl?: number) => Promise<void>;
  delete: (cacheKey: string) => Promise<boolean>;
}

export interface CacheItem {
  response: {
    body: string;
    status: number;
    statusText: string;
  };
  policy: CachePolicyObject;
}

export interface PolicyResponse {
  policy: CachePolicy;
  response: Response;
}

export type SharedCacheStatus =
  | 'HIT'
  | 'MISS'
  | 'EXPIRED'
  | 'STALE'
  | 'BYPASS'
  | 'REVALIDATED'
  | 'DYNAMIC';

export type SharedCacheQueryOptions = CacheQueryOptions;

export type SharedCacheFetch = typeof fetch;

export interface SharedCacheRequestInitProperties {
  cacheControlOverride?: string;
  cacheKeyRules?: SharedCacheKeyRules;
  ignoreRequestCacheControl?: boolean;
  ignoreVary?: boolean;
  varyOverride?: string;
}

declare global {
  interface Request {
    sharedCache?: SharedCacheRequestInitProperties;
  }
  interface RequestInit {
    sharedCache?: SharedCacheRequestInitProperties;
  }
  interface CacheQueryOptions {
    /** @private */
    _ignoreRequestCacheControl?: boolean;
    /** @private */
    _fetch?: typeof fetch;
  }
}
