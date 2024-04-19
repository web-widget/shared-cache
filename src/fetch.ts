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
import {
  SharedCacheStatus,
  SharedCacheFetch,
  SharedCacheRequestInitProperties,
} from './types';

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

    if (!(cache instanceof SharedCache)) {
      throw TypeError('Invalid cache.');
    }

    const request = new Request(input, init);
    const requestCache = getRequestCacheMode(request, init?.cache);
    const sharedCache = init?.sharedCache;

    if (requestCache === 'no-store') {
      const fetchedResponse = await fetcher(request);
      setCacheControlAndVary(fetchedResponse, sharedCache);
      setCacheStatus(fetchedResponse.headers, BYPASS);
      return fetchedResponse;
    }

    const cachedResponse = await cache.match(request, {
      ...sharedCache,
      _fetch: fetcher,
      forceCache:
        requestCache === 'force-cache' || requestCache === 'only-if-cached',
    });

    if (cachedResponse) {
      setCacheStatus(cachedResponse.headers, HIT);
      return cachedResponse;
    }

    if (requestCache === 'only-if-cached') {
      throw TypeError('Failed to fetch.');
    }

    const fetchedResponse = await fetcher(request);
    const cacheControl = fetchedResponse.headers.get('cache-control');
    setCacheControlAndVary(fetchedResponse, sharedCache);

    if (cacheControl) {
      if (bypassCache(cacheControl)) {
        setCacheStatus(fetchedResponse.headers, BYPASS);
      } else {
        const ok = await cache.put(request, fetchedResponse, sharedCache).then(
          () => true,
          () => false
        );
        setCacheStatus(fetchedResponse.headers, ok ? MISS : DYNAMIC);
      }
    } else {
      setCacheStatus(fetchedResponse.headers, DYNAMIC);
    }

    return fetchedResponse;
  };
}

export const sharedCacheFetch = createSharedCacheFetch();

function setCacheStatus(headers: Headers, status: SharedCacheStatus) {
  if (!headers.has(CACHE_STATUS_HEADERS_NAME)) {
    headers.set(CACHE_STATUS_HEADERS_NAME, status);
  }
}

function setCacheControlAndVary(
  response: Response,
  sharedCache?: SharedCacheRequestInitProperties
) {
  if (response.ok) {
    if (sharedCache?.cacheControlOverride) {
      cacheControl(response.headers, sharedCache.cacheControlOverride);
    }
    if (sharedCache?.varyOverride) {
      vary(response.headers, sharedCache.varyOverride);
    }
  }
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
