import CachePolicy, {
  CachePolicyObject,
} from '@web-widget/http-cache-semantics';
import { CacheKeyPartDefiners, CacheKeyRules } from './cache-key';

export type SharedCacheOptions = {
  /**
   * Cache namespace.
   * @private
   */
  _cacheName?: string;

  /**
   * Default cache key rules.
   */
  cacheKeyRules?: CacheKeyRules;

  /**
   * Define custom parts for cache keys.
   */
  cacheKeyPartDefiners?: CacheKeyPartDefiners;

  waitUntil?: (promise: Promise<any>) => void;

  /**
   * @default globalThis.fetch
   */
  fetch?: typeof fetch;
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

export type CacheStatus =
  | 'HIT'
  | 'MISS'
  | 'EXPIRED'
  | 'STALE'
  | 'BYPASS'
  | 'REVALIDATED'
  | 'DYNAMIC';

export type SharedCacheMatchOptions = {
  /**
   * Method to initiate a request after cache expiration.
   * @private
   */
  _fetch?: typeof fetch;

  /**
   * Force cache to be used even if it's stale.
   */
  forceCache?: boolean;
} & SharedCacheQueryOptions;

export type SharedCacheQueryOptions = {
  cacheKeyRules?: CacheKeyRules;
  ignoreCacheControl?: boolean;
  /** @deprecated */
  ignoreMethod?: never;
  /** @deprecated */
  ignoreSearch?: never;
  /** @deprecated */
  ignoreVary?: never;
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
