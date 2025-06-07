import CachePolicy from '@web-widget/http-cache-semantics';
import type {
  SharedCacheOptions,
  KVStorage,
  SharedCacheQueryOptions,
  CacheItem,
  PolicyResponse,
  SharedCacheStatus,
  Logger,
} from './types';
import {
  createCacheKeyGenerator,
  DEFAULT_CACHE_KEY_RULES,
  vary as getVary,
} from './cache-key';
import type { FilterOptions } from './cache-key';
import {
  CACHE_STATUS_HEADERS_NAME,
  EXPIRED,
  HIT,
  REVALIDATED,
  STALE,
} from './constants';

/**
 * SharedCache implements the Cache interface with additional features for shared caching.
 * It provides HTTP-compliant caching with support for revalidation, stale-while-revalidate,
 * and custom cache key generation.
 *
 * This implementation follows HTTP caching semantics as defined in RFC 7234 and related specifications.
 */
export class SharedCache implements Cache {
  /** Cache key generator function for creating consistent cache keys */
  #cacheKeyGenerator: (request: Request) => Promise<string>;

  /** Logger instance for debugging and monitoring */
  #logger?: Logger;

  /** Underlying storage backend */
  #storage: KVStorage;

  /**
   * Creates a new SharedCache instance.
   *
   * @param storage - The key-value storage backend for persistence
   * @param options - Configuration options for cache behavior
   * @throws {TypeError} When storage is not provided
   */
  constructor(storage: KVStorage, options?: SharedCacheOptions) {
    if (!storage) {
      throw new TypeError('Missing storage.');
    }

    const resolvedOptions = {
      ...options,
    };

    const cacheKeyGenerator = createCacheKeyGenerator(
      resolvedOptions._cacheName,
      resolvedOptions.cacheKeyPartDefiners
    );

    this.#cacheKeyGenerator = async (request) =>
      cacheKeyGenerator(request, {
        ...DEFAULT_CACHE_KEY_RULES,
        ...resolvedOptions.cacheKeyRules,
        ...request.sharedCache?.cacheKeyRules,
      });

    this.#logger = resolvedOptions.logger;
    this.#storage = storage;
  }

  /**
   * The add() method is not implemented in this cache implementation.
   * This method is part of the Cache interface but not commonly used in practice.
   *
   * @param _request - The request to add (unused)
   * @throws {Error} Always throws as this method is not implemented
   */
  async add(_request: RequestInfo): Promise<void> {
    throw new Error('SharedCache.add() is not implemented. Use put() instead.');
  }

  /**
   * The addAll() method is not implemented in this cache implementation.
   * This method is part of the Cache interface but not commonly used in practice.
   *
   * @param _requests - The requests to add (unused)
   * @throws {Error} Always throws as this method is not implemented
   */
  async addAll(_requests: RequestInfo[]): Promise<void> {
    throw new Error(
      'SharedCache.addAll() is not implemented. Use put() for each request instead.'
    );
  }

  /**
   * The delete() method of the Cache interface finds the Cache entry whose key
   * matches the request, and if found, deletes the Cache entry and returns a Promise
   * that resolves to true. If no Cache entry is found, it resolves to false.
   *
   * This implementation follows the algorithm specified in the Cache API specification:
   * https://w3c.github.io/ServiceWorker/#cache-delete
   *
   * @param request - The Request for which you are looking to delete. This can be a Request object or a URL.
   * @param options - An object whose properties control how matching is done in the delete operation.
   * @returns A Promise that resolves to true if the cache entry is deleted, or false otherwise.
   */
  async delete(
    request: RequestInfo,
    options?: CacheQueryOptions
  ): Promise<boolean> {
    // 1. Let r be the result of calling the algorithm specified in the "Request" section
    let r: Request | null = null;

    // 2. If request is a Request object, then:
    if (request instanceof Request) {
      // 2.1. Set r to request.
      r = request;

      // 2.2. If r's method is not GET and options' ignoreMethod is not true, return false.
      if (r.method !== 'GET' && !options?.ignoreMethod) {
        return false;
      }
    } else {
      // 3. Otherwise, set r to the result of invoking the Request constructor with request.
      r = new Request(request);
    }

    r = r!;

    this.#verifyCacheQueryOptions(options);
    const cacheKey = await this.#cacheKeyGenerator(r);

    return deleteCacheItem(r, this.#storage, cacheKey);
  }

  /**
   * The keys() method is not implemented in this cache implementation.
   * This method would return all Request objects that serve as keys for cached responses.
   *
   * @param _request - Optional request to match against (unused)
   * @param _options - Optional query options (unused)
   * @throws {Error} Always throws as this method is not implemented
   */
  async keys(
    _request?: RequestInfo,
    _options?: CacheQueryOptions
  ): Promise<readonly Request[]> {
    throw new Error('SharedCache.keys() is not implemented.');
  }

  /**
   * The match() method of the Cache interface returns a Promise that resolves
   * to the Response associated with the first matching request in the Cache
   * object. If no match is found, the Promise resolves to undefined.
   *
   * This implementation includes advanced features:
   * - HTTP cache validation (ETag, Last-Modified)
   * - Stale-while-revalidate support
   * - Custom cache key generation
   * - Proper Vary header handling
   *
   * @param request - The Request for which you are attempting to find responses in the Cache.
   *                  This can be a Request object or a URL.
   * @param options - An object that sets options for the match operation.
   * @returns A Promise that resolves to the first Response that matches the request
   *          or to undefined if no match is found.
   */
  async match(
    request: RequestInfo,
    options?: CacheQueryOptions
  ): Promise<Response | undefined> {
    // 1. Let r be the result of calling the algorithm specified in the "Request" section
    let r: Request | null = null;

    // 2. If request is not undefined, then:
    if (request !== undefined) {
      if (request instanceof Request) {
        // 2.1.1. Set r to request.
        r = request;

        // 2.1.2. If r's method is not GET and options' ignoreMethod is not true, return undefined.
        if (r.method !== 'GET' && !options?.ignoreMethod) {
          return undefined;
        }
      } else if (typeof request === 'string') {
        // 2.2.1. Set r to the result of invoking the Request constructor with request.
        r = new Request(request);
      }
    }

    r = r!;

    this.#verifyCacheQueryOptions(options);
    const cacheKey = await this.#cacheKeyGenerator(r);
    const cacheItem = await getCacheItem(r, this.#storage, cacheKey);

    if (!cacheItem) {
      return;
    }

    const fetch = options?._fetch;
    const policy = CachePolicy.fromObject(cacheItem.policy);

    const { body, status, statusText } = cacheItem.response;
    const headers = policy.responseHeaders();
    const stale = policy.stale();
    const response = new Response(body, {
      status,
      statusText,
      headers,
    });

    // Check if the cached response satisfies the request without revalidation
    if (
      !policy.satisfiesWithoutRevalidation(r, {
        ignoreRequestCacheControl: options?._ignoreRequestCacheControl,
        ignoreMethod: true,
        ignoreSearch: true,
        ignoreVary: true,
      }) ||
      stale
    ) {
      if (!fetch) {
        return;
      } else if (stale && policy.useStaleWhileRevalidate()) {
        // Serve stale response while revalidating in background
        const waitUntil =
          options?._waitUntil ??
          ((promise: Promise<unknown>) => {
            promise.catch(this.#logger?.error);
          });

        waitUntil(
          this.#revalidate(
            r,
            {
              response: response.clone(),
              policy,
            },
            cacheKey,
            fetch,
            options
          )
        );
        this.#setCacheStatus(response, STALE);
        return response;
      } else {
        // Revalidate synchronously
        return this.#revalidate(
          r,
          {
            response,
            policy,
          },
          cacheKey,
          fetch,
          options
        );
      }
    }

    this.#setCacheStatus(response, HIT);
    return response;
  }

  /**
   * The matchAll() method is not implemented in this cache implementation.
   * This method would return all matching responses for a given request.
   *
   * @param _request - Optional request to match against (unused)
   * @param _options - Optional query options (unused)
   * @throws {Error} Always throws as this method is not implemented
   */
  async matchAll(
    _request?: RequestInfo,
    _options?: CacheQueryOptions
  ): Promise<readonly Response[]> {
    throw new Error('SharedCache.matchAll() is not implemented.');
  }

  /**
   * The put() method of the Cache interface allows key/value pairs to be added
   * to the current Cache object.
   *
   * This implementation includes several HTTP-compliant validations:
   * - Only HTTP/HTTPS schemes are supported for GET requests
   * - 206 (Partial Content) responses are rejected
   * - Vary: * responses are rejected
   * - Body usage validation to prevent corruption
   *
   * @param request - The Request object or URL that you want to add to the cache.
   * @param response - The Response you want to match up to the request.
   * @throws {TypeError} For various validation failures as per Cache API specification
   */
  async put(request: RequestInfo, response: Response): Promise<void> {
    return this.#putWithCustomCacheKey(request, response).catch((error) => {
      this.#logger?.error('Cache.put: Failed to cache response.', {
        url: request instanceof Request ? request.url : request,
        error,
      });
      throw error;
    });
  }

  /**
   * Internal method for putting responses with custom cache keys.
   * Implements the full Cache API put algorithm with HTTP validation.
   *
   * @param request - The request to cache
   * @param response - The response to cache
   * @param cacheKey - Optional custom cache key
   * @throws {TypeError} For various HTTP-compliant validation failures
   */
  async #putWithCustomCacheKey(
    request: RequestInfo,
    response: Response,
    cacheKey?: string | SharedCacheQueryOptions
  ): Promise<void> {
    // 1. Let innerRequest be the result of calling the algorithm specified in the "Request" section
    let innerRequest = null;

    // 2. If request is a Request object, then set innerRequest to request.
    if (request instanceof Request) {
      innerRequest = request;
    } else {
      // 3. Otherwise, set innerRequest to the result of invoking the Request constructor with request.
      innerRequest = new Request(request);
    }

    // 4. If innerRequest's url's scheme is not an HTTP(S) scheme or innerRequest's method is not GET,
    // then throw a TypeError.
    if (
      !this.#urlIsHttpHttpsScheme(innerRequest.url) ||
      innerRequest.method !== 'GET'
    ) {
      throw new TypeError(
        `Cache.put: Expected an http/s scheme when method is not GET.`
      );
    }

    // 5. Let innerResponse be response.
    const innerResponse = response;

    // 6. If innerResponse's status is 206, then throw a TypeError.
    if (innerResponse.status === 206) {
      throw new TypeError(`Cache.put: Got 206 status.`);
    }

    // 7. If innerResponse's headers contain a vary header, then:
    if (innerResponse.headers.has('vary')) {
      // 7.1. Let fieldValues be the result of getting, decoding, and splitting vary from innerResponse's headers.
      const fieldValues = this.#getFieldValues(
        innerResponse.headers.get('vary')!
      );

      // 7.2. For each fieldValue in fieldValues:
      for (const fieldValue of fieldValues) {
        // 7.2.1. If fieldValue matches "*", then throw a TypeError.
        if (fieldValue === '*') {
          throw new TypeError(`Cache.put: Got * vary field value.`);
        }
      }
    }

    // 8. If innerResponse's body is not null and innerResponse's body is unusable, then throw a TypeError.
    if (
      innerResponse.body &&
      (innerResponse.bodyUsed || innerResponse.body.locked)
    ) {
      throw new TypeError(`Cache.put: Response body is locked or disturbed.`);
    }

    // 9. Let clonedResponse be the result of cloning innerResponse.
    const clonedResponse = innerResponse.clone();

    // Create cache policy to determine storability and TTL
    const policy = new CachePolicy(innerRequest, clonedResponse);
    const ttl = policy.timeToLive();

    // Don't store if not storable or TTL is zero/negative
    if (!policy.storable() || ttl <= 0) {
      return;
    }

    const cacheItem: CacheItem = {
      policy: policy.toObject(),
      response: {
        body: await clonedResponse.text(),
        status: clonedResponse.status,
        statusText: clonedResponse.statusText,
      },
    };

    if (typeof cacheKey !== 'string') {
      cacheKey = await this.#cacheKeyGenerator(innerRequest);
    }

    await setCacheItem(
      this.#storage,
      cacheKey,
      cacheItem,
      ttl,
      innerRequest,
      clonedResponse
    );
  }

  /**
   * Performs cache revalidation using conditional requests.
   * Implements HTTP conditional request logic as per RFC 7234.
   *
   * @param request - Original request being revalidated
   * @param resolveCacheItem - Cached item with policy to revalidate
   * @param cacheKey - Cache key for storing updated response
   * @param fetch - Fetch function for network requests
   * @param options - Cache query options
   * @returns Updated response with appropriate cache status
   */
  async #revalidate(
    request: Request,
    resolveCacheItem: PolicyResponse,
    cacheKey: string,
    fetch: typeof globalThis.fetch,
    options: SharedCacheQueryOptions | undefined
  ): Promise<Response> {
    // Create conditional request with validation headers (If-None-Match, If-Modified-Since)
    const revalidationRequest = new Request(request, {
      headers: resolveCacheItem.policy.revalidationHeaders(request, {
        ignoreRequestCacheControl: options?._ignoreRequestCacheControl,
        ignoreMethod: true,
        ignoreSearch: true,
        ignoreVary: true,
      }),
    });

    let revalidationResponse: Response;

    try {
      revalidationResponse = await fetch(revalidationRequest);
    } catch (error) {
      // Network error: create 500 response
      revalidationResponse = new Response(
        error instanceof Error ? error.message : 'Internal Server Error',
        {
          status: 500,
        }
      );
    }

    // Log server errors during revalidation
    if (revalidationResponse.status >= 500) {
      this.#logger?.error(`Cache: Revalidation failed.`, {
        url: request.url,
        status: revalidationResponse.status,
        cacheKey,
      });
    }

    // Determine if cached response is still fresh based on conditional response
    const { modified, policy: revalidatedPolicy } =
      resolveCacheItem.policy.revalidatedPolicy(
        revalidationRequest,
        revalidationResponse
      );

    // Use new response if modified, otherwise use cached response
    const response = modified
      ? revalidationResponse
      : resolveCacheItem.response;

    // Store the updated response/policy in cache
    await this.#putWithCustomCacheKey(request, response, cacheKey);

    // Create response with updated headers from revalidated policy
    const clonedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: revalidatedPolicy.responseHeaders(),
    });

    // Set appropriate cache status based on revalidation result
    if (modified) {
      this.#setCacheStatus(clonedResponse, EXPIRED);
    } else {
      this.#setCacheStatus(clonedResponse, REVALIDATED);
    }

    return clonedResponse;
  }

  /**
   * Sets the cache status header on a response.
   * Used to indicate the cache result to clients via the X-Shared-Cache header.
   *
   * @param response - Response object to modify
   * @param status - Cache status value to set
   */
  #setCacheStatus(response: Response, status: SharedCacheStatus): void {
    response.headers.set(CACHE_STATUS_HEADERS_NAME, status);
  }

  /**
   * Validates cache query options, throwing errors for unsupported features.
   * Currently ignoreSearch and ignoreVary are not implemented.
   *
   * @param options - Cache query options to validate
   * @throws {Error} If unsupported options are specified
   */
  #verifyCacheQueryOptions(options: CacheQueryOptions | undefined): void {
    if (options) {
      ['ignoreSearch', 'ignoreVary'].forEach((option) => {
        if (option in options) {
          throw new Error(`Not implemented: "${option}" option.`);
        }
      });
    }
  }

  /**
   * Checks if a URL uses an HTTP or HTTPS scheme.
   * Used to validate request URLs before caching as per HTTP specifications.
   *
   * @param url - URL string to validate
   * @returns True if the URL uses http: or https: scheme
   */
  #urlIsHttpHttpsScheme(url: string): boolean {
    return /^https?:/.test(url);
  }

  /**
   * Parses comma-separated header field values.
   * Used for parsing Vary header values and other structured headers.
   *
   * @param header - Header value string to parse
   * @returns Array of trimmed field values
   */
  #getFieldValues(header: string): string[] {
    return header.split(',').map((value) => value.trim());
  }
}

/**
 * Retrieves a cache item from storage with Vary header support.
 * Implements HTTP Vary header processing as per RFC 7234 Section 4.1.
 *
 * This function handles:
 * - Base cache key lookup when ignoreVary is true
 * - Vary-aware cache key resolution when Vary headers are present
 * - Proper cache miss handling
 *
 * @param request - The HTTP request to look up in cache
 * @param storage - Key-value storage backend
 * @param customCacheKey - Base cache key for the request
 * @returns Promise resolving to cached item or undefined if not found
 */
async function getCacheItem(
  request: Request,
  storage: KVStorage,
  customCacheKey: string
): Promise<CacheItem | undefined> {
  let cacheKey = customCacheKey;
  const ignoreVary = request.sharedCache?.ignoreVary;

  // If not ignoring Vary headers, compute effective cache key
  if (!ignoreVary) {
    cacheKey = await getEffectiveCacheKey(request, storage, customCacheKey);
  }

  return (await storage.get(cacheKey)) as CacheItem | undefined;
}

/**
 * Deletes a cache item from storage with Vary header support.
 * Implements proper cache invalidation as per HTTP specifications.
 *
 * When Vary headers are involved, this function:
 * - Deletes the specific vary-keyed entry
 * - Also deletes the base cache key to ensure complete invalidation
 * - Handles cases where no Vary processing is needed
 *
 * @param request - The HTTP request to delete from cache
 * @param storage - Key-value storage backend
 * @param customCacheKey - Base cache key for the request
 * @returns Promise resolving to true if item was deleted, false if not found
 */
async function deleteCacheItem(
  request: Request,
  storage: KVStorage,
  customCacheKey: string
): Promise<boolean> {
  let cacheKey = customCacheKey;
  const ignoreVary = request.sharedCache?.ignoreVary;

  // Compute effective cache key if Vary processing is enabled
  if (!ignoreVary) {
    cacheKey = await getEffectiveCacheKey(request, storage, customCacheKey);
  }

  if (cacheKey === customCacheKey) {
    // Simple case: delete the base key
    return storage.delete(cacheKey);
  } else {
    // Vary case: delete both vary-specific key and base key for complete invalidation
    return (
      (await storage.delete(cacheKey)) && (await storage.delete(customCacheKey))
    );
  }
}

/**
 * Stores a cache item in storage with Vary header support.
 * Implements HTTP Vary header processing for cache storage as per RFC 7234.
 *
 * This function:
 * - Processes Vary headers to create appropriate cache keys
 * - Stores Vary filter metadata for future lookups
 * - Handles cases where Vary processing is disabled
 * - Ensures proper cache key generation based on varying headers
 *
 * @param storage - Key-value storage backend
 * @param customCacheKey - Base cache key for the request
 * @param cacheItem - Cache item containing response and policy data
 * @param ttl - Time to live in seconds for cache expiration
 * @param request - Original HTTP request being cached
 * @param response - HTTP response being cached
 * @returns Promise that resolves when item is stored
 */
async function setCacheItem(
  storage: KVStorage,
  customCacheKey: string,
  cacheItem: CacheItem,
  ttl: number,
  request: Request,
  response: Response
): Promise<void> {
  let cacheKey = customCacheKey;
  const ignoreVary = request.sharedCache?.ignoreVary;

  if (!ignoreVary) {
    const vary = response.headers.get('vary');
    const varyFilterOptions = await getAndSaveVaryFilterOptions(
      storage,
      customCacheKey,
      ttl,
      vary
    );
    cacheKey = await getVaryCacheKey(
      request,
      customCacheKey,
      varyFilterOptions
    );
  }

  await storage.set(cacheKey, cacheItem, ttl);
}

/**
 * Computes the effective cache key for a request considering Vary headers.
 * This function implements the cache key resolution algorithm for Vary-enabled caches.
 *
 * @param request - HTTP request to compute cache key for
 * @param storage - Storage backend to retrieve Vary metadata
 * @param customCacheKey - Base cache key
 * @returns Promise resolving to the effective cache key
 */
async function getEffectiveCacheKey(
  request: Request,
  storage: KVStorage,
  customCacheKey: string
): Promise<string> {
  const varyFilterOptions = await getVaryFilterOptions(storage, customCacheKey);
  return getVaryCacheKey(request, customCacheKey, varyFilterOptions);
}

/**
 * Retrieves Vary filter options from storage.
 * These options define which headers should be used for cache key generation.
 *
 * @param storage - Storage backend
 * @param customCacheKey - Base cache key to retrieve Vary options for
 * @returns Promise resolving to filter options or undefined if not found
 */
async function getVaryFilterOptions(
  storage: KVStorage,
  customCacheKey: string
): Promise<FilterOptions | undefined> {
  const varyKey = `${customCacheKey}:vary`;
  return (await storage.get(varyKey)) as FilterOptions | undefined;
}

/**
 * Processes and stores Vary header information for cache key generation.
 * Implements Vary header parsing as per RFC 7234 Section 4.1.
 *
 * This function:
 * - Parses Vary header field values
 * - Rejects Vary: * responses (handled at put() level)
 * - Stores filter options for future cache key generation
 *
 * @param storage - Storage backend
 * @param customCacheKey - Base cache key
 * @param ttl - Time to live for the Vary metadata
 * @param vary - Vary header value from response
 * @returns Promise resolving to filter options or undefined for invalid Vary values
 */
async function getAndSaveVaryFilterOptions(
  storage: KVStorage,
  customCacheKey: string,
  ttl: number,
  vary: string | null
): Promise<FilterOptions | undefined> {
  if (!vary || vary === '*') {
    return;
  }

  const varyKey = `${customCacheKey}:vary`;
  const varyFilterOptions: FilterOptions = {
    include: vary.split(',').map((field) => field.trim()),
  };

  await storage.set(varyKey, varyFilterOptions, ttl);
  return varyFilterOptions;
}

/**
 * Generates a Vary-aware cache key based on filter options.
 * Creates cache keys that incorporate header values specified in Vary header.
 *
 * @param request - HTTP request to generate key for
 * @param customCacheKey - Base cache key
 * @param varyFilterOptions - Filter options defining which headers to include
 * @returns Promise resolving to the final cache key
 */
async function getVaryCacheKey(
  request: Request,
  customCacheKey: string,
  varyFilterOptions: FilterOptions | undefined
): Promise<string> {
  if (!varyFilterOptions) {
    return customCacheKey;
  }

  const varyPart = await getVary(request, varyFilterOptions);
  return varyPart ? `${customCacheKey}:${varyPart}` : customCacheKey;
}
