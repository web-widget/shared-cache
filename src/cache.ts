import CachePolicy from '@web-widget/http-cache-semantics';
import type {
  SharedCacheOptions,
  KVStorage,
  SharedCacheQueryOptions,
  CacheItem,
  PolicyResponse,
  CacheStatus,
  SharedCacheMatchOptions,
} from './types';
import { createCacheKeyGenerator, vary as getVary } from './cache-key';
import type { CacheKeyRules, FilterOptions } from './cache-key';
import { CACHE_STATUS_HEADERS_NAME, EXPIRED, HIT, STALE } from './constants';

const ORIGINAL_FETCH = globalThis.fetch;

export class SharedCache implements Cache {
  #storage: KVStorage;
  #waitUntil: (promise: Promise<any>) => void;
  #cacheKeyRules?: CacheKeyRules;
  #fetch: typeof fetch;
  #cacheKeyGenerator: (
    request: Request,
    options?: SharedCacheQueryOptions
  ) => Promise<string>;

  constructor(storage: KVStorage, options?: SharedCacheOptions) {
    if (!storage) {
      throw new TypeError('storage is required.');
    }

    const resolveOptions = {
      waitUntil() {},
      ...options,
    };

    this.#storage = storage;
    this.#waitUntil = resolveOptions.waitUntil;
    this.#fetch = resolveOptions.fetch ?? ORIGINAL_FETCH;
    this.#cacheKeyRules = resolveOptions.cacheKeyRules;
    this.#cacheKeyGenerator = createCacheKeyGenerator(
      resolveOptions._cacheName,
      resolveOptions.cacheKeyPartDefiners
    );
  }

  /** @private */
  async add(_request: RequestInfo): Promise<void> {
    throw new Error('Not Implemented.');
  }

  /** @private */
  async addAll(_requests: RequestInfo[]): Promise<void> {
    throw new Error('Not Implemented.');
  }

  /**
   * The delete() method of the Cache interface finds the Cache entry whose key
   * is the request, and if found, deletes the Cache entry and returns a Promise
   * that resolves to true. If no Cache entry is found, it resolves to false.
   * @param request The Request you are looking to delete. This can be a Request
   * object or a URL.
   * @param options An object whose properties control how matching is done in
   * the delete operation.
   * @returns a Promise that resolves to true if the cache entry is deleted, or
   * false otherwise.
   */
  async delete(
    requestInfo: RequestInfo,
    options?: SharedCacheQueryOptions
  ): Promise<boolean> {
    const request =
      typeof requestInfo === 'string' ? new Request(requestInfo) : requestInfo;
    const cacheKey = await this.#cacheKeyGenerator(request, {
      cacheKeyRules: this.#cacheKeyRules,
      ...options,
    });

    return deleteCacheItem(request, this.#storage, cacheKey);
  }

  /** @private */
  async keys(
    _requestInfo?: RequestInfo,
    _options?: SharedCacheQueryOptions
  ): Promise<readonly Request[]> {
    throw new Error('Not Implemented.');
  }

  /**
   * The match() method of the Cache interface returns a Promise that resolves
   * to the Response associated with the first matching request in the Cache
   * object. If no match is found, the Promise resolves to undefined.
   * @param request The Request for which you are attempting to find responses
   * in the Cache. This can be a Request object or a URL.
   * @param options An object that sets options for the match operation.
   * @returns A Promise that resolves to the first Response that matches the
   * request or to undefined if no match is found.
   */
  async match(
    requestInfo: RequestInfo,
    options?: SharedCacheMatchOptions
  ): Promise<Response | undefined> {
    const request =
      typeof requestInfo === 'string' ? new Request(requestInfo) : requestInfo;
    const cacheKey = await this.#cacheKeyGenerator(request, {
      cacheKeyRules: this.#cacheKeyRules,
      ...options,
    });
    const cacheItem = await getCacheItem(request, this.#storage, cacheKey);

    if (!cacheItem) {
      return;
    }

    const fetch = options?._fetch ?? this.#fetch;
    const ignoreCacheControl = options?.ignoreCacheControl;
    const forceCache = options?.forceCache;
    const { body, status, statusText } = cacheItem.response;
    const policy = CachePolicy.fromObject(cacheItem.policy);
    const headers = policy.responseHeaders();
    let response = new Response(body, {
      status,
      statusText,
      headers,
    });

    const stale = ignoreCacheControl
      ? policy.stale()
      : !policy.satisfiesWithoutRevalidation(request);

    if (!forceCache && stale) {
      const resolveCacheItem: PolicyResponse = {
        response,
        policy,
      };
      /* istanbul ignore else */
      if (policy.useStaleWhileRevalidate()) {
        // Well actually, in this case it's fine to return the stale response.
        // But we'll update the cache in the background.
        this.#waitUntil(
          this.#revalidate(request, resolveCacheItem, cacheKey, fetch).then(
            () => {}
          )
        );
        this.#setCacheStatus(response.headers, STALE);
      } else {
        // NOTE: This will take effect when caching TTL is not working.
        await deleteCacheItem(request, this.#storage, cacheKey);
        response = await this.#revalidate(
          request,
          resolveCacheItem,
          cacheKey,
          fetch
        );
        this.#setCacheStatus(response.headers, EXPIRED);
      }
    } else {
      this.#setCacheStatus(response.headers, HIT);
    }

    return response;
  }

  /** @private */
  async matchAll(
    _requestInfo?: RequestInfo,
    _options?: SharedCacheQueryOptions
  ): Promise<readonly Response[]> {
    throw new Error('Not Implemented.');
  }

  /**
   * The put() method of the Cache interface allows key/value pairs to be added
   * to the current Cache object.
   * @param request The Request object or URL that you want to add to the cache.
   * @param response The Response you want to match up to the request.
   */
  async put(
    requestInfo: RequestInfo,
    response: Response,
    options?: SharedCacheMatchOptions
  ): Promise<void> {
    const request =
      typeof requestInfo === 'string' ? new Request(requestInfo) : requestInfo;
    const cacheKey = await this.#cacheKeyGenerator(request, {
      cacheKeyRules: this.#cacheKeyRules,
      ...options,
    });
    return this.#putWithCustomCacheKey(request, response, cacheKey);
  }

  async #putWithCustomCacheKey(
    request: Request,
    response: Response,
    cacheKey: string
  ): Promise<void> {
    if (request.method !== 'GET') {
      throw new TypeError('Cannot cache response to non-GET request.');
    }

    if (response.status === 206) {
      throw new TypeError(
        'Cannot cache response to a range request (206 Partial Content).'
      );
    }

    if (response.headers.get('vary')?.includes('*')) {
      throw new TypeError("Cannot cache response with 'Vary: *' header.");
    }

    const policy = new CachePolicy(request, response);
    const ttl = policy.timeToLive();

    if (!policy.storable() || ttl <= 0) {
      return;
    }

    const cacheItem: CacheItem = {
      policy: policy.toObject(),
      response: {
        body: await response.clone().text(),
        status: response.status,
        statusText: response.statusText,
      },
    };

    await setCacheItem(
      this.#storage,
      cacheKey,
      cacheItem,
      ttl,
      request,
      response
    );
  }

  async #revalidate(
    request: Request,
    resolveCacheItem: PolicyResponse,
    cacheKey: string,
    fetch: typeof globalThis.fetch
  ): Promise<Response> {
    const revalidationRequest = new Request(request, {
      headers: resolveCacheItem.policy.revalidationHeaders(request),
    });
    let revalidationResponse: Response;

    try {
      revalidationResponse = await fetch(revalidationRequest);
    } catch (error) {
      if (resolveCacheItem.policy.useStaleIfError()) {
        return resolveCacheItem.response;
      } else {
        throw error;
      }
    }

    const { modified, policy: revalidatedPolicy } =
      resolveCacheItem.policy.revalidatedPolicy(
        revalidationRequest,
        revalidationResponse
      );
    const response = modified
      ? revalidationResponse
      : resolveCacheItem.response;

    await this.#putWithCustomCacheKey(request, response, cacheKey);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: revalidatedPolicy.responseHeaders(),
    });
  }

  #setCacheStatus(headers: Headers, status: CacheStatus) {
    headers.set(CACHE_STATUS_HEADERS_NAME, status);
  }
}

async function getCacheItem(
  request: Request,
  storage: KVStorage,
  customCacheKey: string
): Promise<CacheItem> {
  const varyKey = `vary:${customCacheKey}`;
  const varyFilterOptions: FilterOptions | undefined =
    await storage.get(varyKey);
  const varyPart = varyFilterOptions
    ? await getVary(request, varyFilterOptions)
    : undefined;
  const cacheKey = varyPart ? `${customCacheKey}:${varyPart}` : customCacheKey;
  const cacheItem: CacheItem = await storage.get(cacheKey);
  return cacheItem;
}

async function deleteCacheItem(
  request: Request,
  storage: KVStorage,
  customCacheKey: string
): Promise<boolean> {
  const varyKey = `vary:${customCacheKey}`;
  const varyFilterOptions: FilterOptions | undefined =
    await storage.get(varyKey);
  const varyPart = varyFilterOptions
    ? await getVary(request, varyFilterOptions)
    : undefined;
  const cacheKey = varyPart ? `${customCacheKey}:${varyPart}` : customCacheKey;

  return varyFilterOptions
    ? (await storage.delete(varyKey)) && (await storage.delete(cacheKey))
    : storage.delete(cacheKey);
}

async function setCacheItem(
  storage: KVStorage,
  customCacheKey: string,
  cacheItem: CacheItem,
  ttl: number,
  request: Request,
  response: Response
): Promise<void> {
  const vary = response.headers.get('vary');
  if (vary) {
    const varyKey = `vary:${customCacheKey}`;
    const varyFilterOptions: FilterOptions =
      vary === '*'
        ? true
        : { include: vary.split(',').map((field) => field.trim()) };
    const varyPart = await getVary(request, varyFilterOptions);
    const cacheKey = `${customCacheKey}:${varyPart}`;
    await storage.set(varyKey, varyFilterOptions, ttl);
    await storage.set(cacheKey, cacheItem, ttl);
  } else {
    await storage.set(customCacheKey, cacheItem, ttl);
  }
}
