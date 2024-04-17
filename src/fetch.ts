import { cacheControl, fresh, vary } from '@web-widget/helpers/headers';
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
  CacheStatus,
  SharedCacheFetch,
  SharedCacheRequestInitProperties,
} from './types';
import { STATUS_TEXT, Status } from '@web-widget/helpers/status';

const ORIGINAL_FETCH = globalThis.fetch;

export function createSharedCacheFetch(
  cache?: SharedCache,
  options?: {
    fetch?: typeof fetch;
  }
): SharedCacheFetch {
  const fetcher = options?.fetch ?? ORIGINAL_FETCH;
  return async function fetch(input, init) {
    cache ??=
      caches instanceof SharedCacheStorage
        ? ((await caches.open('default')) as SharedCache)
        : undefined;

    if (!cache) {
      throw TypeError('Missing cache.');
    }

    if (!(cache instanceof SharedCache)) {
      throw TypeError('Cache is not an instance of SharedCache.');
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
      if (isNotModified(request, cachedResponse)) {
        return notModified(cachedResponse);
      }
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

    if (isNotModified(request, fetchedResponse)) {
      return notModified(fetchedResponse);
    }

    return fetchedResponse;
  };
}

export const sharedCacheFetch = createSharedCacheFetch();

function setCacheStatus(headers: Headers, status: CacheStatus) {
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

/**
 * Default headers to pass through on 304 responses. From the spec:
 * > The response must not contain a body and must include the headers that
 * > would have been sent in an equivalent 200 OK response: Cache-Control,
 * > Content-Location, Date, ETag, Expires, and Vary.
 */
const RETAINED_304_HEADERS = [
  'cache-control',
  'content-location',
  'date',
  'etag',
  'expires',
  'vary',
];

function isNotModified(req: Request, res: Response) {
  const method = req.method;

  // GET or HEAD for weak freshness validation only
  if (method !== 'GET' && method !== 'HEAD') return false;

  const status = res.status;
  // 2xx or 304 as per rfc2616 14.26
  if ((status >= 200 && status < 300) || status === 304) {
    return fresh(req.headers, res.headers);
  }

  return false;
}

function notModified(response: Response) {
  response.headers.forEach((_, key) => {
    if (!RETAINED_304_HEADERS.includes(key.toLowerCase())) {
      response.headers.delete(key);
    }
  });
  return new Response(null, {
    status: Status.NotModified,
    statusText: STATUS_TEXT[Status.NotModified],
    headers: response.headers,
  });
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
