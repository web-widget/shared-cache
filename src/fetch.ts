import { cacheControl, vary } from '@web-widget/helpers/headers';
import { SharedCache } from './cache';
import { SharedCacheStorage } from './cache-storage';
import {
  BYPASS,
  CACHE_STATUS_HEADERS_NAME,
  DYNAMIC,
  HIT,
  MISS,
} from './constants';
import { SharedCacheStatus, SharedCacheFetch } from './types';

const ORIGINAL_FETCH = globalThis.fetch;

export function createSharedCacheFetch(
  cache?: SharedCache,
  options?: {
    fetch?: typeof fetch;
  }
): SharedCacheFetch {
  const fetcher = options?.fetch ?? ORIGINAL_FETCH;
  return async function fetch(input, init) {
    if (!cache && globalThis.caches instanceof SharedCacheStorage) {
      cache = await globalThis.caches.open('default');
    }

    if (!cache) {
      throw TypeError('Missing cache.');
    }

    // if (!(cache instanceof SharedCache)) {
    //   throw TypeError('Invalid cache.');
    // }

    const request = new Request(input, init);
    const requestCache = getRequestCacheMode(request, init?.cache);
    const sharedCacheOptions = (request.sharedCache = {
      ignoreRequestCacheControl: true,
      ignoreVary: false,
      ...request.sharedCache,
      ...init?.sharedCache,
    });

    const interceptor = createInterceptor(
      fetcher,
      sharedCacheOptions.cacheControlOverride,
      sharedCacheOptions.varyOverride
    );

    if (requestCache && requestCache !== 'default') {
      throw new Error(`Not implemented: "cache" option.`);
    }

    const cachedResponse = await cache.match(request, {
      _fetch: interceptor,
      _ignoreRequestCacheControl: sharedCacheOptions.ignoreRequestCacheControl,
      _waitUntil: sharedCacheOptions.waitUntil,
      ignoreMethod: request.method === 'HEAD',
    });

    if (cachedResponse) {
      setCacheStatus(cachedResponse, HIT);
      return cachedResponse;
    }

    const fetchedResponse = await interceptor(request);
    const cacheControl = fetchedResponse.headers.get('cache-control');

    if (cacheControl) {
      if (bypassCache(cacheControl)) {
        setCacheStatus(fetchedResponse, BYPASS);
      } else {
        const ok = await cache.put(request, fetchedResponse).then(
          () => true,
          () => false
        );
        setCacheStatus(fetchedResponse, ok ? MISS : DYNAMIC);
      }
    } else {
      setCacheStatus(fetchedResponse, DYNAMIC);
    }

    return fetchedResponse;
  };
}

export const sharedCacheFetch = createSharedCacheFetch();

function setCacheStatus(response: Response, status: SharedCacheStatus) {
  const headers = response.headers;
  if (!headers.has(CACHE_STATUS_HEADERS_NAME)) {
    headers.set(CACHE_STATUS_HEADERS_NAME, status);
  }
}

function createInterceptor(
  fetcher: typeof fetch,
  cacheControlOverride: string | undefined,
  varyOverride: string | undefined
): typeof fetch {
  return async function fetch(...args) {
    const response = await fetcher(...args);
    const headers = response.headers;
    if (response.ok) {
      if (cacheControlOverride) {
        cacheControl(headers, cacheControlOverride);
      }
      if (varyOverride) {
        vary(headers, varyOverride);
      }
    }
    return response;
  };
}

function bypassCache(cacheControl: string) {
  return (
    cacheControl.includes('no-store') ||
    cacheControl.includes('no-cache') ||
    cacheControl.includes('private') ||
    cacheControl.includes('s-maxage=0') ||
    (!cacheControl.includes('s-maxage') && cacheControl.includes('max-age=0'))
  );
}

function getRequestCacheMode(
  request: Request,
  defaultCacheMode?: RequestCache
) {
  try {
    // NOTE: On the server side, `request.cache` may not be implemented
    // Error: Failed to get the 'cache' property on 'Request': the property is not implemented.
    return request.cache;
  } catch (error) {
    return defaultCacheMode;
  }
}
