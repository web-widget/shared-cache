import CachePolicy, {
  CachePolicyObject,
} from '@web-widget/http-cache-semantics';
import { SharedCacheKeyPartDefiners, SharedCacheKeyRules } from './cache-key';

export { SharedCacheKeyRules, SharedCacheKeyPartDefiners };

export type WebCache = globalThis.Cache;
export type WebCacheQueryOptions = globalThis.CacheQueryOptions;
export type WebCacheStorage = globalThis.CacheStorage;
export type WebFetch = typeof globalThis.fetch;
export type WebRequest = globalThis.Request;
export type WebRequestInit = globalThis.RequestInit;

/**
 * Configuration options for SharedCache instances.
 * These options control caching behavior and key generation.
 */
export interface SharedCacheOptions {
  /**
   * Cache namespace for organizing cached responses.
   * Used internally to distinguish between different cache instances.
   * @internal
   */
  _cacheName?: string;

  /**
   * Rules for generating cache keys from requests.
   * Controls which parts of the request are used in the cache key.
   */
  cacheKeyRules?: SharedCacheKeyRules;

  /**
   * Custom functions for generating cache key parts.
   * Allows extending cache key generation with custom logic.
   */
  cacheKeyPartDefiners?: SharedCacheKeyPartDefiners;

  /**
   * Custom logger for debugging and monitoring cache operations.
   */
  logger?: Logger;
}

/**
 * Logger interface for cache operations.
 * Provides standardized logging methods for debugging and monitoring.
 *
 * All log methods follow a consistent format:
 * - message: A descriptive string with "SharedCache:" prefix for context
 * - optionalParams: Structured data object containing relevant context
 */
export interface Logger {
  /**
   * Log informational messages about normal cache operations.
   * Used for general operational information like cache hits, successful operations.
   */
  info(message?: unknown, ...optionalParams: unknown[]): void;

  /**
   * Log warning messages about potentially problematic situations.
   * Used for non-critical issues that might need attention.
   */
  warn(message?: unknown, ...optionalParams: unknown[]): void;

  /**
   * Log detailed debugging information.
   * Used for verbose operational details useful during development and troubleshooting.
   */
  debug(message?: unknown, ...optionalParams: unknown[]): void;

  /**
   * Log error messages about failed operations.
   * Used for critical issues that prevent normal operation.
   */
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

/**
 * Key-Value storage interface for cache persistence.
 * This abstraction allows different storage backends (memory, Redis, etc.).
 */
export interface KVStorage {
  /**
   * Retrieve a value from storage.
   * @param cacheKey - The key to retrieve
   * @returns The stored value or undefined if not found
   */
  get: (cacheKey: string) => Promise<unknown | undefined>;

  /**
   * Store a value in storage with optional TTL.
   * @param cacheKey - The key to store
   * @param value - The value to store
   * @param ttl - Time to live in seconds (optional)
   */
  set: (cacheKey: string, value: unknown, ttl?: number) => Promise<void>;

  /**
   * Delete a value from storage.
   * @param cacheKey - The key to delete
   * @returns True if the key was deleted, false if it didn't exist
   */
  delete: (cacheKey: string) => Promise<boolean>;
}

/**
 * Cached response item structure.
 * Contains the serialized response data and associated cache policy.
 */
export interface CacheItem {
  /**
   * Serialized response data.
   */
  response: {
    /** Response body as text */
    body: string;
    /** HTTP status code */
    status: number;
    /** HTTP status text */
    statusText: string;
  };
  /**
   * Serialized cache policy object from http-cache-semantics.
   */
  policy: CachePolicyObject;
}

/**
 * Policy response pair used in revalidation.
 */
export interface PolicyResponse {
  /** The cache policy instance */
  policy: CachePolicy;
  /** The cached response */
  response: Response;
}

/**
 * Cache status values as defined in HTTP caching standards.
 * These represent the result of cache operations.
 */
export type SharedCacheStatus =
  /** Cache hit - response served from cache */
  | 'HIT'
  /** Cache miss - response fetched from origin */
  | 'MISS'
  /** Cached response expired, fetched fresh response */
  | 'EXPIRED'
  /** Stale response served (stale-while-revalidate) */
  | 'STALE'
  /** Cache bypassed due to cache-control directives */
  | 'BYPASS'
  /** Cached response revalidated and still fresh */
  | 'REVALIDATED'
  /** Dynamic response that cannot be cached */
  | 'DYNAMIC';

/**
 * Extended cache query options for shared cache operations.
 * Extends standard SharedCacheQueryOptions with shared cache specific options.
 */
export type SharedCacheQueryOptions = WebCacheQueryOptions & {
  /**
   * Internal option to ignore request cache control headers.
   * @internal
   */
  _ignoreRequestCacheControl?: boolean;

  /**
   * Internal fetch function override.
   * @internal
   */
  _fetch?: typeof globalThis.fetch;

  /**
   * Internal waitUntil function for background operations.
   * @internal
   */
  _waitUntil?: (promise: Promise<unknown>) => void;
};

/**
 * Type alias for fetch function compatible with shared cache.
 */
export type SharedCacheFetch = (
  input: SharedCacheRequestInfo | URL,
  init?: SharedCacheRequestInit
) => Promise<Response>;

export type SharedCacheRequestInfo = Request | string;

export type SharedCacheRequestInit = WebRequestInit & {
  sharedCache?: SharedCacheRequestInitProperties;
};

export type SharedCacheRequest = WebRequest & {
  sharedCache?: SharedCacheRequestInitProperties;
};

/**
 * Shared cache specific request properties.
 * These properties control cache behavior on a per-request basis.
 */
export interface SharedCacheRequestInitProperties {
  /**
   * Override the cache-control header for caching decisions.
   * This allows forcing specific cache behavior regardless of origin headers.
   */
  cacheControlOverride?: string;

  /**
   * Custom cache key rules for this specific request.
   * Overrides default cache key generation rules.
   */
  cacheKeyRules?: SharedCacheKeyRules;

  /**
   * Whether to ignore request cache-control headers.
   * When true, request cache-control directives are ignored.
   */
  ignoreRequestCacheControl?: boolean;

  /**
   * Whether to ignore Vary header processing.
   * When true, Vary header is not considered for cache key generation.
   */
  ignoreVary?: boolean;

  /**
   * Override the vary header for this request.
   * Allows custom vary behavior regardless of response headers.
   */
  varyOverride?: string;

  /**
   * Function to handle background operations (like stale-while-revalidate).
   * Called with promises that should be awaited in the background.
   */
  waitUntil?: (promise: Promise<unknown>) => void;
}
