import CachePolicy, {
  CachePolicyObject,
} from '@web-widget/http-cache-semantics';
import { SharedCacheKeyPartDefiners, SharedCacheKeyRules } from './cache-key';

export { SharedCacheKeyRules, SharedCacheKeyPartDefiners };

export type SharedCacheOptions = {
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

  waitUntil?: (promise: Promise<any>) => void;

  /**
   * @default globalThis.fetch
   */
  fetch?: typeof fetch;

  /**
   * Custom logger.
   */
  logger?: Logger;
};

export type Logger = {
  info(message?: any, ...optionalParams: any[]): void;
  error(message?: any, ...optionalParams: any[]): void;
};

export type KVStorage = {
  get: (cacheKey: string) => Promise<any | undefined>;
  set: (cacheKey: string, value: any, ttl?: number) => Promise<void>;
  delete: (cacheKey: string) => Promise<boolean>;
};

export type CacheItem = {
  response: {
    body: string;
    status: number;
    statusText: string;
  };
  policy: CachePolicyObject;
};

export type PolicyResponse = {
  policy: CachePolicy;
  response: Response;
};

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
  /**
   * Force cache to be used even if it's stale.
   */
  forceCache?: boolean;
  /** @private */
  ignoreMethod?: never;
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
