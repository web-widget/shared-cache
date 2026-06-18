/* c8 ignore start */
/**
 * Package-level type barrel. Domain types (cache key, logger) are defined in
 * their modules and re-exported here; `index.ts` exposes types only via this file.
 *
 * Constants: HTTP/status → `constants.ts`; key defaults → `key.ts` (`DEFAULT_CACHE_KEY_RULES`).
 */
import CachePolicy, {
  CachePolicyObject,
} from '@web-widget/http-cache-semantics';
import type { Logger } from './utils/logger';

export type { Logger } from './utils/logger';
export type { CacheStatus } from './constants';

/**
 * Filter options for controlling which keys to include/exclude in cache key generation.
 */
export interface KeyFilterOptions {
  /** Array of keys to explicitly include in the cache key */
  include?: string[];
  /** Array of keys to explicitly exclude from the cache key */
  exclude?: string[];
  /** Array of keys to check for presence only (value set to empty string) */
  checkPresence?: string[];
}

/**
 * Configuration rules for generating cache keys.
 * Each property can be `true`, `false`, or {@link KeyFilterOptions}.
 */
export interface CacheKeyRules {
  cookie?: KeyFilterOptions | boolean;
  device?: KeyFilterOptions | boolean;
  header?: KeyFilterOptions | boolean;
  /**
   * @internal Scheme is implicit in the URL cache key and not separately configurable.
   */
  scheme?: KeyFilterOptions | boolean;
  /**
   * @internal Host is implicit in the URL cache key and not separately configurable.
   */
  host?: KeyFilterOptions | boolean;
  /**
   * @internal Pathname is implicit in the URL cache key and not separately configurable.
   */
  pathname?: KeyFilterOptions | boolean;
  search?: KeyFilterOptions | boolean;
}

/** Cache key generator with an optional synchronous fast path for URL-only rules. */
export interface CacheKeyGenerator {
  (request: Request, cacheKeyRules?: CacheKeyRules): Promise<string>;
  sync: (request: Request, cacheKeyRules?: CacheKeyRules) => string | undefined;
}

/** URL normalization options passed via `SharedCacheOptions._cacheKeyNormalize`. */
interface CacheKeyNormalizeOptions {
  trailingSlash?: boolean;
  pathnameLowerCase?: boolean;
  ignoreSpaces?: boolean;
}

/**
 * Log context structure for SharedCache operations
 */
export interface CacheLogContext {
  /** The URL being processed */
  url?: string;
  /** Cache key involved in the operation */
  cacheKey?: string;
  /** HTTP status code */
  status?: number;
  /** Operation duration in milliseconds */
  duration?: number;
  /** Error object if applicable */
  error?: unknown;
  /** Cache hit/miss/stale status */
  cacheStatus?: string;
  /** TTL value in seconds */
  ttl?: number;
  /** Request method */
  method?: string;
  /** Additional context data */
  [key: string]: unknown;
}

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
  cacheKeyRules?: CacheKeyRules;

  /**
   * URL normalization applied before cache key generation.
   * Defaults to the normalization performed by `new URL(request.url)`.
   * Set to `false` to skip optional extra normalization.
   * @internal
   */
  _cacheKeyNormalize?: boolean | CacheKeyNormalizeOptions;

  /**
   * Custom logger for debugging and monitoring cache operations.
   */
  logger?: Logger;
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
export interface CachePolicyResponse {
  /** The cache policy instance */
  policy: CachePolicy;
  /** The cached response */
  response: Response;
  /**
   * Response body already materialized in storage.
   * Avoids re-reading the response stream during 304 revalidation.
   */
  storedBody?: string;
}

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
   * Internal event instance for background operations.
   * @internal
   */
  _event?: ExtendableEvent;
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
   * Whether to expose the computed cache key via response header.
   * When true, the response includes the `x-cache-key` header for debugging.
   * Non-ASCII and control characters in the key are percent-encoded for valid HTTP headers.
   */
  debugCacheKey?: boolean;

  /**
   * Override the cache-control header for caching decisions.
   * This allows forcing specific cache behavior regardless of origin headers.
   */
  cacheControlOverride?: string;

  /**
   * Custom cache key rules for this specific request.
   * Overrides default cache key generation rules.
   */
  cacheKeyRules?: CacheKeyRules;

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
   * Event instance to handle background operations (like stale-while-revalidate).
   * The event.waitUntil() method will be called with promises that should be awaited in the background.
   */
  event?: ExtendableEvent;

  /**
   * Function to handle background operations (like stale-while-revalidate).
   * Called with promises that should be awaited in the background.
   * @deprecated Use event instead. This option will be removed in a future version.
   */
  waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * Phase indicating why a cache origin handler is invoked.
 */
export type CacheOriginPhase = 'miss' | 'revalidate';

/**
 * Context passed to middleware-friendly cache origin handlers.
 */
export interface CacheOriginContext {
  /** Why the origin is being invoked. */
  phase: CacheOriginPhase;
  /** Present when invoked from a conditional revalidation request. */
  revalidationRequest?: Request;
  /** Abort signal from the outer resolve call or request. */
  signal?: AbortSignal;
}

/**
 * In-process origin handler for middleware integrations.
 *
 * @remarks
 * - **miss**: throws propagate to the caller (framework error handling).
 * - **revalidate**: throws are converted to 5xx responses for stale-if-error.
 */
export type CacheOriginHandler = (
  request: Request,
  context: CacheOriginContext
) => Response | Promise<Response>;

/**
 * Options for {@link resolveWithCache} and {@link createCacheHandler}.
 */
export type CacheResolveOptions = SharedCacheRequestInitProperties & {
  signal?: AbortSignal;
};

export interface CacheHandler {
  resolve(
    request: Request,
    origin: CacheOriginHandler,
    options?: CacheResolveOptions
  ): Promise<Response>;
}
/* c8 ignore stop */
