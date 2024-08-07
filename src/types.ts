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

export type SharedCacheQueryOptions = {
  cacheKeyRules?: SharedCacheKeyRules;
  ignoreRequestCacheControl?: boolean;
  ignoreMethod?: boolean;
  /** @private */
  ignoreSearch?: never;
  /** @private */
  ignoreVary?: never;
  /**
   * Method to initiate a request after cache expiration.
   * @private
   */
  _fetch?: typeof fetch;
} & CacheQueryOptions;

export type SharedCacheFetch = (
  input: RequestInfo | URL,
  init?: {
    sharedCache?: SharedCacheRequestInitProperties;
  } & RequestInit
) => Promise<Response>;

export type SharedCacheRequestInitProperties = {
  cacheControlOverride?: string;
  varyOverride?: string;
} & SharedCacheQueryOptions;
