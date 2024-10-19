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

export class SharedCache implements Cache {
  #cacheKeyGenerator: (request: Request) => Promise<string>;
  #logger?: Logger;
  #storage: KVStorage;

  constructor(storage: KVStorage, options?: SharedCacheOptions) {
    if (!storage) {
      throw TypeError('Missing storage.');
    }

    const resolveOptions = {
      ...options,
    };

    const cacheKeyGenerator = createCacheKeyGenerator(
      resolveOptions._cacheName,
      resolveOptions.cacheKeyPartDefiners
    );
    this.#cacheKeyGenerator = async (request) =>
      cacheKeyGenerator(request, {
        ...DEFAULT_CACHE_KEY_RULES,
        ...resolveOptions.cacheKeyRules,
        ...request.sharedCache?.cacheKeyRules,
      });
    this.#logger = resolveOptions.logger;
    this.#storage = storage;
  }

  /** @private */
  async add(_request: RequestInfo): Promise<void> {
    throw new Error('Not implemented.');
  }

  /** @private */
  async addAll(_requests: RequestInfo[]): Promise<void> {
    throw new Error('Not implemented.');
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
    request: RequestInfo,
    options?: CacheQueryOptions
  ): Promise<boolean> {
    // 1.
    let r: Request | null = null;

    // 2.
    if (request instanceof Request) {
      // 2.1
      r = request;

      // 2.2
      if (r.method !== 'GET' && !options?.ignoreMethod) {
        return false;
      }
    } else {
      // 3.
      r = new Request(request);
    }

    r = r!;

    this.#verifyCacheQueryOptions(options);
    const cacheKey = await this.#cacheKeyGenerator(r);

    return deleteCacheItem(r, this.#storage, cacheKey);
  }

  /** @private */
  async keys(
    _request?: RequestInfo,
    _options?: CacheQueryOptions
  ): Promise<readonly Request[]> {
    throw new Error('Not implemented.');
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
    request: RequestInfo,
    options?: CacheQueryOptions
  ): Promise<Response | undefined> {
    // 1.
    let r: Request | null = null;

    // 2.
    if (request !== undefined) {
      if (request instanceof Request) {
        // 2.1.1
        r = request;

        // 2.1.2
        if (r.method !== 'GET' && !options?.ignoreMethod) {
          return undefined;
        }
      } else if (typeof request === 'string') {
        // 2.2.1
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
        const waitUntil =
          options?._waitUntil ??
          ((promise: Promise<unknown>) => {
            promise.catch(this.#logger?.error);
          });
        // Well actually, in this case it's fine to return the stale response.
        // But we'll update the cache in the background.
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

  /** @private */
  async matchAll(
    _request?: RequestInfo,
    _options?: CacheQueryOptions
  ): Promise<readonly Response[]> {
    throw new Error('Not implemented.');
  }

  /**
   * The put() method of the Cache interface allows key/value pairs to be added
   * to the current Cache object.
   * @param request The Request object or URL that you want to add to the cache.
   * @param response The Response you want to match up to the request.
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

  async #putWithCustomCacheKey(
    request: RequestInfo,
    response: Response,
    cacheKey?: string | SharedCacheQueryOptions
  ): Promise<void> {
    // 1.
    let innerRequest = null;

    // 2.
    if (request instanceof Request) {
      innerRequest = request;
    } else {
      // 3.
      innerRequest = new Request(request);
    }

    // 4.
    if (
      !urlIsHttpHttpsScheme(innerRequest.url) ||
      innerRequest.method !== 'GET'
    ) {
      throw new TypeError(
        `Cache.put: Expected an http/s scheme when method is not GET.`
      );
    }

    // 5.
    const innerResponse = response;

    // 6.
    if (innerResponse.status === 206) {
      throw new TypeError(`Cache.put: Got 206 status.`);
    }

    // 7.
    if (innerResponse.headers.has('vary')) {
      // 7.1.
      const fieldValues = getFieldValues(innerResponse.headers.get('vary')!);

      // 7.2.
      for (const fieldValue of fieldValues) {
        // 7.2.1
        if (fieldValue === '*') {
          throw new TypeError(`Cache.put: Got * vary field value.`);
        }
      }
    }

    // 8.
    if (
      innerResponse.body &&
      (innerResponse.bodyUsed || innerResponse.body.locked)
    ) {
      throw new TypeError(`Cache.put: Response body is locked or disturbed.`);
    }

    // 9.
    const clonedResponse = innerResponse.clone();

    // TODO: 10. - 19.

    const policy = new CachePolicy(innerRequest, clonedResponse);
    const ttl = policy.timeToLive();

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

  async #revalidate(
    request: Request,
    resolveCacheItem: PolicyResponse,
    cacheKey: string,
    fetch: typeof globalThis.fetch,
    options: SharedCacheQueryOptions | undefined
  ): Promise<Response> {
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
      revalidationResponse = new Response(
        error instanceof Error ? error.message : 'Internal Server Error',
        {
          status: 500,
        }
      );
    }

    if (revalidationResponse.status >= 500) {
      this.#logger?.error(`Cache: Revalidation failed.`, {
        url: request.url,
        status: revalidationResponse.status,
        cacheKey,
      });
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

    const clonedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: revalidatedPolicy.responseHeaders(),
    });

    if (modified) {
      this.#setCacheStatus(clonedResponse, EXPIRED);
    } else {
      this.#setCacheStatus(clonedResponse, REVALIDATED);
    }

    return clonedResponse;
  }

  #setCacheStatus(response: Response, status: SharedCacheStatus) {
    response.headers.set(CACHE_STATUS_HEADERS_NAME, status);
  }

  #verifyCacheQueryOptions(options: CacheQueryOptions | undefined) {
    if (options) {
      ['ignoreSearch', 'ignoreVary'].forEach((option) => {
        if (option in options) {
          throw new Error(`Not implemented: "${option}" option.`);
        }
      });
    }
  }
}

async function getCacheItem(
  request: Request,
  storage: KVStorage,
  customCacheKey: string
): Promise<CacheItem | undefined> {
  let cacheKey = customCacheKey;
  const ignoreVary = request.sharedCache?.ignoreVary;

  if (!ignoreVary) {
    cacheKey = await getEffectiveCacheKey(request, storage, customCacheKey);
  }

  return (await storage.get(cacheKey)) as CacheItem | undefined;
}

async function deleteCacheItem(
  request: Request,
  storage: KVStorage,
  customCacheKey: string
): Promise<boolean> {
  let cacheKey = customCacheKey;
  const ignoreVary = request.sharedCache?.ignoreVary;

  if (!ignoreVary) {
    cacheKey = await getEffectiveCacheKey(request, storage, customCacheKey);
  }

  if (cacheKey === customCacheKey) {
    return storage.delete(cacheKey);
  } else {
    return (
      (await storage.delete(cacheKey)) && (await storage.delete(customCacheKey))
    );
  }
}

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

async function getEffectiveCacheKey(
  request: Request,
  storage: KVStorage,
  customCacheKey: string
): Promise<string> {
  const varyFilterOptions = await getVaryFilterOptions(storage, customCacheKey);
  return getVaryCacheKey(request, customCacheKey, varyFilterOptions);
}

async function getVaryFilterOptions(
  storage: KVStorage,
  customCacheKey: string
): Promise<FilterOptions | undefined> {
  const varyKey = `${customCacheKey}:vary`;
  return (await storage.get(varyKey)) as FilterOptions | undefined;
}

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

/**
 * @see https://fetch.spec.whatwg.org/#http-scheme
 */
function urlIsHttpHttpsScheme(url: string): boolean {
  return /^https?:/.test(url);
}

/**
 * @see https://github.com/chromium/chromium/blob/694d20d134cb553d8d89e5500b9148012b1ba299/content/browser/cache_storage/cache_storage_cache.cc#L260-L262
 */
function getFieldValues(header: string): string[] {
  return header.split(',').map((value) => value.trim());
}
