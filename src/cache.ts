import type {
  CacheItem,
  WebCache,
  KVStorage,
  CachePolicyResponse,
  CacheLogContext,
  SharedCacheOptions,
  SharedCacheQueryOptions,
  SharedCacheRequest,
  SharedCacheRequestInfo,
} from './types';
import CachePolicy, {
  type CachePolicyObject,
} from '@web-widget/http-cache-semantics';
import { createLogger, StructuredLogger } from './utils/logger';
import {
  appendVaryKeySuffix,
  createCacheKeyGenerator,
  DEFAULT_CACHE_KEY_RULES,
  readStoredVaryFilter,
  writeStoredVaryFilter,
} from './key';
import type { CacheKeyGenerator, CacheKeyRules } from './types';
import {
  createNotModifiedResponse,
  hasConditionalRequestHeaders,
  isErrorResponse,
  satisfiesConditionalRequest,
} from './utils/conditional';
import { applyCacheStatus } from './utils/response';
import { EXPIRED, HIT, REVALIDATED, STALE, UPDATING } from './constants';

/** Separates cache namespace from the URL-shaped cache key in storage. */
const CACHE_NAMESPACE_SEPARATOR = '\x1f';

/**
 * Prefixes storage keys with a cache namespace without changing the logical cache key.
 */
function createNamespacedStorage(
  storage: KVStorage,
  cacheName?: string
): KVStorage {
  if (!cacheName || cacheName === 'default') {
    return storage;
  }

  const prefix = `${cacheName}${CACHE_NAMESPACE_SEPARATOR}`;

  return {
    get: (cacheKey) => storage.get(`${prefix}${cacheKey}`),
    set: (cacheKey, value, ttl) =>
      storage.set(`${prefix}${cacheKey}`, value, ttl),
    delete: (cacheKey) => storage.delete(`${prefix}${cacheKey}`),
  };
}

/**
 * SharedCache implements the Cache interface with additional features for shared caching.
 * It provides HTTP-compliant caching with support for revalidation, stale-while-revalidate,
 * and custom cache key generation.
 *
 * This implementation follows HTTP caching semantics as defined in RFC 7234 and related specifications.
 */
export class SharedCache implements WebCache {
  /** Cache key generator factory */
  #cacheKeyGeneratorFactory: CacheKeyGenerator;

  /** Base cache key rules configured for this cache instance */
  #defaultCacheKeyRules: CacheKeyRules;

  /** Structured logger instance with consistent formatting */
  #structuredLogger: ReturnType<typeof createLogger<CacheLogContext>>;

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

    const cacheKeyGenerator = createCacheKeyGenerator(
      options?._cacheKeyNormalize
    );

    this.#cacheKeyGeneratorFactory = cacheKeyGenerator;
    this.#defaultCacheKeyRules = {
      ...DEFAULT_CACHE_KEY_RULES,
      ...options?.cacheKeyRules,
    };

    // Optimize logger initialization: avoid double wrapping if already a StructuredLogger
    if (options?.logger instanceof StructuredLogger) {
      this.#structuredLogger =
        options.logger as StructuredLogger<CacheLogContext>;
    } else {
      this.#structuredLogger = createLogger<CacheLogContext>(options?.logger);
    }
    this.#storage = createNamespacedStorage(storage, options?._cacheName);
  }

  /**
   * Computes the cache key for a request using the current cache key rules.
   * Useful for debugging and diagnostics in callers that need to surface the key.
   *
   * @param request - Request to compute key for
   * @returns Promise resolving to the computed cache key
   */
  async getCacheKey(request: SharedCacheRequestInfo): Promise<string> {
    const resolved = (
      request instanceof Request ? request : new Request(request)
    ) as SharedCacheRequest;
    const rules = {
      ...this.#defaultCacheKeyRules,
      ...resolved.sharedCache?.cacheKeyRules,
    };
    const syncKey = this.#cacheKeyGeneratorFactory.sync(resolved, rules);

    if (syncKey !== undefined) {
      return syncKey;
    }

    return this.#cacheKeyGeneratorFactory(resolved, rules);
  }

  /**
   * The add() method is not implemented in this cache implementation.
   * This method is part of the Cache interface but not commonly used in practice.
   *
   * @param _request - The request to add (unused)
   * @throws {Error} Always throws as this method is not implemented
   */
  async add(_request: SharedCacheRequestInfo): Promise<void> {
    throw new Error('SharedCache.add() is not implemented. Use put() instead.');
  }

  /**
   * The addAll() method is not implemented in this cache implementation.
   * This method is part of the Cache interface but not commonly used in practice.
   *
   * @param _requests - The requests to add (unused)
   * @throws {Error} Always throws as this method is not implemented
   */
  async addAll(_requests: SharedCacheRequestInfo[]): Promise<void> {
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
    request: SharedCacheRequestInfo,
    options?: SharedCacheQueryOptions
  ): Promise<boolean> {
    verifyCacheQueryOptions('delete', options);
    const resolved = resolveCacheRequest(request, options);
    if (!resolved) {
      return false;
    }

    const cacheKey = await this.getCacheKey(resolved);
    return deleteCacheItem(resolved, this.#storage, cacheKey);
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
    _request?: SharedCacheRequestInfo,
    _options?: SharedCacheQueryOptions
  ): Promise<readonly SharedCacheRequest[]> {
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
    request: SharedCacheRequestInfo,
    options?: SharedCacheQueryOptions
  ): Promise<Response | undefined> {
    verifyCacheQueryOptions('match', options);
    const r = resolveCacheRequest(request, options);
    if (!r) {
      return undefined;
    }

    const cacheKey = await this.getCacheKey(r);
    const cacheItem = await getCacheItem(r, this.#storage, cacheKey);

    if (!cacheItem) {
      this.#structuredLogger.debug('Cache miss', {
        url: r.url,
        cacheKey,
        method: r.method,
      });
      return;
    }

    this.#structuredLogger.debug('Cache item found', {
      url: r.url,
      cacheKey,
      method: r.method,
    });

    const fetch = options?._fetch;
    const policyObject = sanitizeStoredPolicy(cacheItem.policy);
    const policy = CachePolicy.fromObject(policyObject);
    const evaluationRequest = normalizePolicyRequest(r, policyObject, options);
    const evaluation = policy.evaluateRequest(evaluationRequest);

    const { body, status, statusText } = cacheItem.response;

    if (evaluation.revalidation) {
      const responseHeaders =
        evaluation.response?.headers ?? policy.responseHeaders();
      const response = new Response(body, {
        status,
        statusText,
        headers: responseHeaders,
      });

      if (!fetch) {
        return;
      }

      if (evaluation.revalidation.synchronous === false) {
        const event = options?._event;
        const waitUntil =
          event?.waitUntil.bind(event) ??
          ((promise: Promise<unknown>) => {
            promise.catch(
              this.#structuredLogger.handleAsyncError(
                'Stale-while-revalidate',
                {
                  url: r.url,
                  cacheKey,
                }
              )
            );
          });

        waitUntil(
          this.#revalidate(
            r,
            evaluationRequest,
            {
              response,
              policy,
              storedBody: body,
            },
            cacheKey,
            fetch,
            evaluation.revalidation.headers
          )
        );
        applyCacheStatus(response, UPDATING);
        this.#structuredLogger.info(
          'Serving stale response',
          {
            url: r.url,
            cacheKey,
            cacheStatus: 'UPDATING',
          },
          'Revalidating in background'
        );
        return response;
      }

      return this.#revalidate(
        r,
        evaluationRequest,
        {
          response,
          policy,
          storedBody: body,
        },
        cacheKey,
        fetch,
        evaluation.revalidation.headers
      );
    }

    if (!evaluation.response) {
      return;
    }

    const responseHeaders = evaluation.response.headers;

    if (
      hasConditionalRequestHeaders(r) &&
      satisfiesConditionalRequest(r, responseHeaders)
    ) {
      const notModified = createNotModifiedResponse(responseHeaders);
      applyCacheStatus(notModified, HIT);
      this.#structuredLogger.info('Cache hit', {
        url: r.url,
        cacheKey,
        cacheStatus: 'HIT',
      });
      return notModified;
    }

    const response = new Response(body, {
      status,
      statusText,
      headers: responseHeaders,
    });
    applyCacheStatus(response, HIT);
    this.#structuredLogger.info('Cache hit', {
      url: r.url,
      cacheKey,
      cacheStatus: 'HIT',
    });
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
    _request?: SharedCacheRequestInfo,
    _options?: SharedCacheQueryOptions
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
  async put(
    request: SharedCacheRequestInfo,
    response: Response
  ): Promise<void> {
    const innerRequest =
      request instanceof Request ? request : new Request(request);

    // 4. If innerRequest's url's scheme is not an HTTP(S) scheme or innerRequest's method is not GET,
    // then throw a TypeError.
    if (!/^https?:/.test(innerRequest.url) || innerRequest.method !== 'GET') {
      throw new TypeError(
        `SharedCache.put: Expected an http/s scheme when method is not GET.`
      );
    }

    // 5. Let innerResponse be response.
    const innerResponse = response;

    // 6. If innerResponse's status is 206, then throw a TypeError.
    if (innerResponse.status === 206) {
      throw new TypeError(`SharedCache.put: Got 206 status.`);
    }

    // 7. If innerResponse's headers contain a vary header, then:
    if (innerResponse.headers.has('vary')) {
      // 7.1. Let fieldValues be the result of getting, decoding, and splitting vary from innerResponse's headers.
      const fieldValues = innerResponse.headers
        .get('vary')!
        .split(',')
        .map((value) => value.trim());

      // 7.2. For each fieldValue in fieldValues:
      for (const fieldValue of fieldValues) {
        // 7.2.1. If fieldValue matches "*", then throw a TypeError.
        if (fieldValue === '*') {
          throw new TypeError(`SharedCache.put: Got * vary field value.`);
        }
      }
    }

    // 8. If innerResponse's body is not null and innerResponse's body is unusable, then throw a TypeError.
    if (
      innerResponse.body &&
      (innerResponse.bodyUsed || innerResponse.body.locked)
    ) {
      throw new TypeError(
        `SharedCache.put: Response body is locked or disturbed.`
      );
    }

    // 9. Let clonedResponse be the result of cloning innerResponse.
    const clonedResponse = innerResponse.clone();

    // Create cache policy to determine storability and TTL
    const policy = new CachePolicy(innerRequest, clonedResponse);
    const ttl = policy.timeToLive();
    const storable = policy.storable();

    // Don't store if not storable or TTL is zero/negative
    if (!storable || ttl <= 0) {
      this.#structuredLogger.debug(
        'Response not cacheable',
        {
          url: innerRequest.url,
          storable,
          ttl,
          status: innerResponse.status,
        },
        storable ? 'TTL is zero/negative' : 'Policy indicates not storable'
      );
      return;
    }

    this.#structuredLogger.debug('Storing response in cache', {
      url: innerRequest.url,
      status: innerResponse.status,
      ttl,
    });

    const cacheItem: CacheItem = {
      policy: policy.toObject(),
      response: {
        body: await clonedResponse.text(),
        status: clonedResponse.status,
        statusText: clonedResponse.statusText,
      },
    };

    const cacheKey = await this.getCacheKey(innerRequest);

    try {
      await setCacheItem(
        this.#storage,
        cacheKey,
        cacheItem,
        ttl,
        innerRequest,
        clonedResponse
      );
    } catch (error) {
      this.#structuredLogger.error('Put operation failed', {
        url: innerRequest.url,
        error,
      });
      throw error;
    }
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
    evaluationRequest: Request,
    resolveCacheItem: CachePolicyResponse,
    cacheKey: string,
    fetch: typeof globalThis.fetch,
    revalidationHeaders: Headers
  ): Promise<Response> {
    const revalidationRequest = new Request(evaluationRequest, {
      headers: revalidationHeaders,
    });

    let revalidationResponse: Response;

    this.#structuredLogger.debug('Starting revalidation', {
      url: request.url,
      cacheKey,
    });

    try {
      revalidationResponse = await fetch(revalidationRequest);
      this.#structuredLogger.debug('Revalidation response received', {
        url: request.url,
        status: revalidationResponse.status,
        cacheKey,
      });
    } catch (error) {
      // Network error: create 500 response
      this.#structuredLogger.warn(
        'Revalidation network error',
        {
          url: request.url,
          cacheKey,
          error,
        },
        'Using fallback 500 response'
      );

      revalidationResponse = new Response(
        error instanceof Error ? error.message : 'Internal Server Error',
        {
          status: 500,
        }
      );
    }

    // Log server errors during revalidation
    if (revalidationResponse.status >= 500) {
      this.#structuredLogger.error(
        'Revalidation failed',
        {
          url: request.url,
          status: revalidationResponse.status,
          cacheKey,
        },
        'Server returned 5xx status'
      );
    }

    // Determine if cached response is still fresh based on conditional response
    const { modified, policy: revalidatedPolicy } =
      resolveCacheItem.policy.revalidatedPolicy(
        revalidationRequest,
        revalidationResponse
      );

    let responseBody: string;
    let responseStatus: number;
    let responseStatusText: string;

    if (modified) {
      responseBody = await revalidationResponse.clone().text();
      responseStatus = revalidationResponse.status;
      responseStatusText = revalidationResponse.statusText;
    } else {
      responseBody =
        resolveCacheItem.storedBody ??
        (await resolveCacheItem.response.clone().text());
      responseStatus = resolveCacheItem.response.status;
      responseStatusText = resolveCacheItem.response.statusText;
    }

    // Persist the revalidated policy — do not rebuild policy from stale response headers
    await this.#storeRevalidatedCacheItem(
      request,
      revalidatedPolicy,
      {
        body: responseBody,
        status: responseStatus,
        statusText: responseStatusText,
      },
      cacheKey
    );

    const clonedResponse = new Response(responseBody, {
      status: responseStatus,
      statusText: responseStatusText,
      headers: revalidatedPolicy.responseHeaders(),
    });

    // Set appropriate cache status based on revalidation result
    if (modified) {
      applyCacheStatus(clonedResponse, EXPIRED);
      this.#structuredLogger.info(
        'Cache entry expired',
        {
          url: request.url,
          cacheKey,
          cacheStatus: 'EXPIRED',
        },
        'Serving fresh response'
      );
    } else if (isErrorResponse(revalidationResponse)) {
      applyCacheStatus(clonedResponse, STALE);
      this.#structuredLogger.info(
        'Serving stale response',
        {
          url: request.url,
          cacheKey,
          cacheStatus: 'STALE',
        },
        'Origin error within stale-if-error window'
      );
    } else {
      applyCacheStatus(clonedResponse, REVALIDATED);
      this.#structuredLogger.info(
        'Cache entry revalidated',
        {
          url: request.url,
          cacheKey,
          cacheStatus: 'REVALIDATED',
        },
        'Cached response still fresh'
      );
    }

    return clonedResponse;
  }

  /**
   * Stores a revalidated cache entry using the policy from revalidatedPolicy().
   * Avoids rebuilding CachePolicy from response headers, which would persist stale Age values.
   */
  async #storeRevalidatedCacheItem(
    request: Request,
    revalidatedPolicy: CachePolicy,
    response: { body: string; status: number; statusText: string },
    cacheKey: string
  ): Promise<void> {
    const ttl = revalidatedPolicy.timeToLive();
    const storable = revalidatedPolicy.storable();

    if (!storable || ttl <= 0) {
      this.#structuredLogger.debug(
        'Revalidated response not cacheable',
        {
          url: request.url,
          storable,
          ttl,
          status: response.status,
        },
        storable ? 'TTL is zero/negative' : 'Policy indicates not storable'
      );
      return;
    }

    const cacheItem: CacheItem = {
      policy: revalidatedPolicy.toObject(),
      response,
    };

    const responseForVary = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: revalidatedPolicy.responseHeaders(),
    });

    await setCacheItem(
      this.#storage,
      cacheKey,
      cacheItem,
      ttl,
      request as SharedCacheRequest,
      responseForVary
    );
  }
}

/**
 * Normalizes a request for CachePolicy evaluation.
 * Vary matching is handled at the cache-key layer; method, URL, and request
 * headers are aligned with the stored policy metadata before calling evaluateRequest().
 */
function normalizePolicyRequest(
  request: Request,
  policyObject: CachePolicyObject,
  options?: SharedCacheQueryOptions
): Request {
  const headers = new Headers(request.headers);

  if (options?._ignoreRequestCacheControl) {
    headers.delete('cache-control');
    headers.delete('pragma');
  }

  if (policyObject.reqh) {
    for (const [name, value] of Object.entries(policyObject.reqh)) {
      headers.set(name, value);
    }
  }

  return new Request(policyObject.u, {
    method: policyObject.m,
    headers,
  });
}

/**
 * Removes computed Age from stored policy metadata.
 * Age is added at response time via responseHeaders(), not persisted in cache policy.
 */
function sanitizeStoredPolicy(policy: CachePolicyObject): CachePolicyObject {
  if (!policy.resh || policy.resh.age === undefined) {
    return policy;
  }

  const resh = { ...policy.resh };
  delete resh.age;
  return { ...policy, resh };
}

function resolveCacheRequest(
  request: Request | string,
  options?: SharedCacheQueryOptions
): Request | undefined {
  const resolved = request instanceof Request ? request : new Request(request);

  if (resolved.method !== 'GET' && !options?.ignoreMethod) {
    return undefined;
  }

  return resolved;
}

function verifyCacheQueryOptions(
  method: string,
  options: SharedCacheQueryOptions | undefined
): void {
  if (!options) {
    return;
  }

  for (const option of ['ignoreSearch', 'ignoreVary'] as const) {
    if (option in options) {
      throw new Error(
        `SharedCache.${method}() not implemented option: "${option}".`
      );
    }
  }
}

async function resolveVaryStorageKey(
  request: SharedCacheRequest,
  storage: KVStorage,
  baseKey: string
): Promise<string> {
  if (request.sharedCache?.ignoreVary) {
    return baseKey;
  }

  const varyFilter = await readStoredVaryFilter(storage, baseKey);
  return appendVaryKeySuffix(request, baseKey, varyFilter);
}

async function getCacheItem(
  request: SharedCacheRequest,
  storage: KVStorage,
  baseKey: string
): Promise<CacheItem | undefined> {
  const cacheKey = await resolveVaryStorageKey(request, storage, baseKey);
  return (await storage.get(cacheKey)) as CacheItem | undefined;
}

async function deleteCacheItem(
  request: SharedCacheRequest,
  storage: KVStorage,
  baseKey: string
): Promise<boolean> {
  const cacheKey = await resolveVaryStorageKey(request, storage, baseKey);

  if (cacheKey === baseKey) {
    return storage.delete(cacheKey);
  }

  return (await storage.delete(cacheKey)) && (await storage.delete(baseKey));
}

async function setCacheItem(
  storage: KVStorage,
  baseKey: string,
  cacheItem: CacheItem,
  ttl: number,
  request: SharedCacheRequest,
  response: Response
): Promise<void> {
  let cacheKey = baseKey;

  if (!request.sharedCache?.ignoreVary) {
    const varyFilter = await writeStoredVaryFilter(
      storage,
      baseKey,
      ttl,
      response.headers.get('vary')
    );
    cacheKey = await appendVaryKeySuffix(request, baseKey, varyFilter);
  }

  await storage.set(cacheKey, cacheItem, ttl);
}
