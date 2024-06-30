import { LRUCache } from 'lru-cache';
import { KVStorage } from './types';
import { createSharedCacheFetch } from './fetch';
import { SharedCache } from './cache';
import { BYPASS, DYNAMIC, EXPIRED, HIT, MISS, STALE } from './constants';

const TEST_URL = 'http://localhost/';

const createCacheStore = (): KVStorage => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = new LRUCache<string, any>({ max: 1024 });

  return {
    async get(cacheKey) {
      return store.get(cacheKey);
    },
    async set(cacheKey, value, ttl) {
      store.set(cacheKey, value, { ttl });
    },
    async delete(cacheKey) {
      return store.delete(cacheKey);
    },
  };
};

const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('override headers', () => {
  test('the `cache-control` header should be overridable', async () => {
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response('lol', {
          headers: {
            'cache-control': 'max-age=300',
          },
        });
      },
    });
    const res = await fetch(TEST_URL, {
      sharedCache: {
        cacheControlOverride: 's-maxage=120',
      },
    });

    expect(res.headers.get('cache-control')).toBe('max-age=300, s-maxage=120');
    expect(res.headers.get('x-cache-status')).toBe(MISS);
  });

  test('the `vary` header should be overridable', async () => {
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response('lol', {
          headers: {
            vary: 'x-custom',
            'cache-control': 'max-age=300',
          },
        });
      },
    });
    const res = await fetch(TEST_URL, {
      sharedCache: {
        varyOverride: 'accept-language',
      },
    });

    expect(res.headers.get('vary')).toBe('x-custom, accept-language');
    expect(res.headers.get('x-cache-status')).toBe(MISS);
  });

  test('do not set HTTP headers when status code is greater than or equal to 500', async () => {
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response(null, {
          status: 500,
        });
      },
    });
    const res = await fetch(TEST_URL, {
      sharedCache: {
        cacheControlOverride: 's-maxage=120',
        varyOverride: 'accept-language',
      },
    });

    expect(res.headers.get('cache-control')).toBe(null);
    expect(res.headers.get('vary')).toBe(null);
    expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
  });
});

describe('multiple duplicate requests', () => {
  const date = Math.round(Date.now() / 1000);
  const store = createCacheStore();
  const cache = new SharedCache(store);
  const fetch = createSharedCacheFetch(cache, {
    async fetch() {
      return new Response('lol', {
        headers: {
          etag: '"v1"',
          'content-type': 'text/lol; charset=utf-8',
          'last-modified': new Date(date * 1000).toUTCString(),
          'cache-control': 'max-age=300',
        },
      });
    },
  });

  test('when cached when the method is GET it should serve from cache', async () => {
    const res = await fetch(TEST_URL);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/lol; charset=utf-8');
    expect(res.headers.get('etag')).toBe('"v1"');
    expect(res.headers.get('x-cache-status')).toBe(MISS);
    expect(await res.text()).toBe('lol');
  });

  test('serve from cache should set appropriate header', async () => {
    const res = await fetch(TEST_URL);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/lol; charset=utf-8');
    expect(res.headers.get('x-cache-status')).toBe(HIT);
    expect(res.headers.get('etag')).toBe('"v1"');
    expect(await res.text()).toBe('lol');
  });

  test('POST method should not be cached', async () => {
    const res = await fetch(TEST_URL, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/lol; charset=utf-8');
    expect(res.headers.get('x-cache-status')).toBe(MISS);
    expect(res.headers.get('etag')).toBe('"v1"');
    expect(await res.text()).toBe('lol');
  });

  test('when cached when the method is GET it should serve from cache until cleared', async () => {
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response('new content', {
          headers: {
            etag: '"v2"',
            'content-type': 'text/lol; charset=utf-8',
            'last-modified': new Date(date * 1000).toUTCString(),
            'cache-control': 'max-age=300',
          },
        });
      },
    });

    const req = new Request(TEST_URL);
    const res = await fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/lol; charset=utf-8');
    expect(res.headers.get('x-cache-status')).toBe(HIT);
    expect(res.headers.get('etag')).toBe('"v1"');
    expect(await res.text()).toBe('lol');

    // clear cache
    await cache.delete(req);

    const newRes = await fetch(req);
    expect(newRes.status).toBe(200);
    expect(newRes.headers.get('content-type')).toBe('text/lol; charset=utf-8');
    expect(newRes.headers.get('x-cache-status')).toBe(MISS);
    expect(await newRes.text()).toBe('new content');
  });
});

test('when no cache control is set the latest content should be loaded', async () => {
  const store = createCacheStore();
  const cache = new SharedCache(store);
  const fetch = createSharedCacheFetch(cache, {
    async fetch() {
      return new Response('lol');
    },
  });
  const req = new Request(TEST_URL);
  const res = await fetch(req);
  const cacheItem = await cache.match(req);

  expect(res.status).toBe(200);
  expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
  expect(res.headers.get('age')).toBe(null);
  expect(res.headers.get('cache-control')).toBe(null);
  expect(cacheItem).toBeUndefined();
  expect(await res.text()).toBe('lol');
});

test('should respect cache control directives from requests', async () => {
  const store = createCacheStore();
  const cache = new SharedCache(store);
  const fetch = createSharedCacheFetch(cache, {
    async fetch() {
      return new Response('lol', {
        headers: {
          'cache-control': 'max-age=300',
        },
      });
    },
  });
  let res = await fetch(TEST_URL, {
    headers: {
      'cache-control': 'no-cache',
    },
  });

  expect(res.status).toBe(200);
  expect(res.headers.get('x-cache-status')).toBe(MISS);
  expect(res.headers.get('age')).toBe(null);
  expect(res.headers.get('cache-control')).toBe('max-age=300');
  expect(await res.text()).toBe('lol');

  res = await fetch(TEST_URL, {
    headers: {
      'cache-control': 'no-cache',
    },
  });

  expect(res.status).toBe(200);
  expect(res.headers.get('x-cache-status')).toBe(EXPIRED);
  expect(res.headers.get('age')).toBe('0');
  expect(res.headers.get('cache-control')).toBe('max-age=300');
  expect(await res.text()).toBe('lol');
});

test('when body is a string it should cache the response', async () => {
  const store = createCacheStore();
  const cache = new SharedCache(store);
  const fetch = createSharedCacheFetch(cache, {
    async fetch() {
      return new Response('lol', {
        headers: {
          'cache-control': 'max-age=300',
        },
      });
    },
  });
  const req = new Request(TEST_URL);
  const res = await fetch(req);
  const cachedRes = await cache.match(req);

  expect(res.status).toBe(200);
  expect(await cachedRes?.text()).toBe('lol');
});

test('when the method is POST it should not cache the response', async () => {
  const store = createCacheStore();
  const cache = new SharedCache(store);
  const fetch = createSharedCacheFetch(cache, {
    async fetch(input, init) {
      const req = new Request(input, init);
      return new Response(req.method, {
        headers: {
          'cache-control': 'max-age=300',
        },
      });
    },
  });
  const get = new Request(TEST_URL, {
    method: 'GET',
  });
  await fetch(get);
  const post = new Request(TEST_URL, {
    method: 'POST',
  });
  const res = await fetch(post);

  expect(res.status).toBe(200);
  expect(await res.text()).toBe('POST');
  expect(res.headers.get('x-cache-status')).toBe(MISS);
  expect(await cache.match(post)).toBeUndefined();
});

describe('when the `vary` header is present, different versions should be cached', () => {
  test('multiple versions should be cached', async () => {
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch(input, init) {
        const req = new Request(input, init);
        return new Response(req.headers.get('accept-language'), {
          headers: {
            'cache-control': 'max-age=300',
            vary: 'accept-language',
          },
        });
      },
    });
    let req = new Request(TEST_URL, {
      headers: {
        'accept-language': 'en-us',
      },
    });
    let res = await fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(MISS);
    expect(res.headers.get('vary')).toBe('accept-language');
    expect(await res.text()).toBe('en-us');

    res = await fetch(req);
    expect(res.headers.get('x-cache-status')).toBe(HIT);

    req = new Request(TEST_URL, {
      headers: {
        'accept-language': 'tr-tr',
      },
    });
    res = await fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(MISS);
    expect(res.headers.get('vary')).toBe('accept-language');
    expect(await res.text()).toBe('tr-tr');

    res = await fetch(req);
    expect(res.headers.get('x-cache-status')).toBe(HIT);

    req = new Request(TEST_URL, {
      headers: {
        'accept-language': 'en-us',
      },
    });
    res = await fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(HIT);
    expect(res.headers.get('vary')).toBe('accept-language');
    expect(await res.text()).toBe('en-us');
  });

  test('case should be ignored', async () => {
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch(input, init) {
        const req = new Request(input, init);
        return new Response(req.headers.get('accept-language'), {
          headers: {
            'cache-control': 'max-age=300',
            vary: 'Accept-Language',
          },
        });
      },
    });
    const req = new Request(TEST_URL, {
      headers: {
        'accept-language': 'en-us',
      },
    });
    let res = await fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(MISS);
    expect(res.headers.get('vary')).toBe('Accept-Language');
    expect(await res.text()).toBe('en-us');

    res = await fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(HIT);
    expect(res.headers.get('vary')).toBe('Accept-Language');
    expect(await res.text()).toBe('en-us');
  });
});

test('when the response code is not 200 it should not cache the response', async () => {
  const store = createCacheStore();
  const cache = new SharedCache(store);
  const fetch = createSharedCacheFetch(cache, {
    async fetch() {
      return new Response('lol', { status: 201 });
    },
  });
  const post = new Request(TEST_URL, {
    method: 'POST',
  });
  const res = await fetch(post);
  const cacheItem = await cache.match(post);

  expect(res.status).toBe(201);
  expect(await res.text()).toBe('lol');
  expect(cacheItem).toBeUndefined();
});

test('when etag and last-modified headers are set it should cache those values', async () => {
  const date = Math.round(Date.now() / 1000);
  const store = createCacheStore();
  const cache = new SharedCache(store);
  const fetch = createSharedCacheFetch(cache, {
    async fetch() {
      return new Response('lol', {
        headers: {
          'cache-control': 'max-age=1',
          etag: '"v1',
          'content-type': 'text/lol; charset=utf-8',
          'last-modified': new Date(date * 1000).toUTCString(),
        },
      });
    },
  });
  const req = new Request(TEST_URL);
  const res = await fetch(req);
  const cachedRes = await cache.match(req);

  expect(res.status).toBe(200);
  expect(cachedRes).toBeTruthy();
  expect(await cachedRes?.text()).toBe('lol');
  expect(cachedRes?.headers.get('etag')).toBe('"v1');
  expect(cachedRes?.headers.get('content-type')).toBe(
    'text/lol; charset=utf-8'
  );
  expect(cachedRes?.headers.get('last-modified')).toBe(
    new Date(date * 1000).toUTCString()
  );
});

// test('an exception should be thrown when the cache key is empty', async () => {
//   const date = Math.round(Date.now() / 1000);
//   const store = createCacheStore();
//   const cache = new SharedCache(store);
//   const fetch = createSharedCacheFetch(cache, {
//     async fetch() {
//       return new Response('lol');
//     },
//   });
//   const req = new Request(TEST_URL);
//   const res = await fetch(req, {
//     sharedCache: {
//       cacheKeyRules: {},
//     },
//   });
//   expect(res.status).toBe(500);
//   expect(res.headers.get('x-cache-status')).toBe(null);
//   expect(await res.text()).toEqual(
//     expect.stringContaining('Missing cache key.')
//   );
// });

test('`s-maxage` should be used first as cache expiration time', async () => {
  const store = createCacheStore();
  const cache = new SharedCache(store);
  const fetch = createSharedCacheFetch(cache, {
    async fetch() {
      return new Response('lol', {
        headers: {
          'cache-control': 'max-age=3, s-maxage=1',
        },
      });
    },
  });
  const req = new Request(TEST_URL);
  let res = await fetch(req);
  let cachedRes = await cache.match(req);

  expect(res.status).toBe(200);
  expect(res.headers.get('x-cache-status')).toBe(MISS);
  expect(res.headers.get('cache-control')).toBe('max-age=3, s-maxage=1');
  expect(res.headers.get('age')).toBe(null);
  expect(await cachedRes?.text()).toBe('lol');

  res = await fetch(req);
  cachedRes = await cache.match(req);
  expect(res.status).toBe(200);
  expect(res.headers.get('x-cache-status')).toBe(HIT);
  expect(res.headers.get('cache-control')).toBe('max-age=3, s-maxage=1');
  expect(res.headers.get('age')).toBe('0');
  expect(await cachedRes?.text()).toBe('lol');

  await timeout(1000);

  res = await fetch(req);
  cachedRes = await cache.match(req);
  expect(res.status).toBe(200);
  expect(res.headers.get('x-cache-status')).toBe(MISS);
  expect(res.headers.get('cache-control')).toBe('max-age=3, s-maxage=1');
  expect(res.headers.get('age')).toBe(null);
  expect(await cachedRes?.text()).toBe('lol');
});

test('`age` should change based on cache time', async () => {
  const store = createCacheStore();
  const cache = new SharedCache(store);
  const fetch = createSharedCacheFetch(cache, {
    async fetch() {
      return new Response('lol', {
        headers: {
          'cache-control': 'max-age=2',
        },
      });
    },
  });
  let res = await fetch(TEST_URL);
  expect(res.headers.get('x-cache-status')).toBe(MISS);
  expect(res.headers.get('cache-control')).toBe('max-age=2');
  expect(res.headers.get('age')).toBe(null);

  res = await fetch(TEST_URL);
  expect(res.headers.get('x-cache-status')).toBe(HIT);
  expect(res.headers.get('cache-control')).toBe('max-age=2');
  expect(res.headers.get('age')).toBe('0');

  await timeout(1000);
  res = await fetch(TEST_URL);
  expect(res.headers.get('x-cache-status')).toBe(HIT);
  expect(res.headers.get('cache-control')).toBe('max-age=2');
  expect(res.headers.get('age')).toBe('1');

  await timeout(1000);
  res = await fetch(TEST_URL);
  expect(res.headers.get('x-cache-status')).toBe(MISS);
  expect(res.headers.get('cache-control')).toBe('max-age=2');
  expect(res.headers.get('age')).toBe(null);

  await timeout(1000);
  res = await fetch(TEST_URL);
  expect(res.headers.get('x-cache-status')).toBe(HIT);
  expect(res.headers.get('cache-control')).toBe('max-age=2');
  expect(res.headers.get('age')).toBe('1');
});

describe('caching should be allowed to be bypassed', () => {
  test('missing cache control should bypass caching', async () => {
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response('lol');
      },
    });
    let res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe(null);

    res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe(null);
  });

  test('`private` should bypass caching', async () => {
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response('lol', {
          headers: {
            'cache-control': 'private',
          },
        });
      },
    });
    let res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(BYPASS);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe('private');

    res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(BYPASS);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe('private');
  });

  test('`no-store` should bypass caching', async () => {
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response('lol', {
          headers: {
            'cache-control': 'no-store',
          },
        });
      },
    });
    let res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(BYPASS);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe('no-store');

    res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(BYPASS);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  test('`no-cache` should bypass caching', async () => {
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response('lol', {
          headers: {
            'cache-control': 'no-cache',
          },
        });
      },
    });
    let res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(BYPASS);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe('no-cache');

    res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(BYPASS);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  test('`max-age=0` should bypass caching', async () => {
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response('lol', {
          headers: {
            'cache-control': 'max-age=0',
          },
        });
      },
    });
    let res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(BYPASS);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe('max-age=0');

    res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(BYPASS);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe('max-age=0');
  });

  test('`s-maxage=0` should bypass caching', async () => {
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response('lol', {
          headers: {
            'cache-control': 's-maxage=0',
          },
        });
      },
    });
    let res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(BYPASS);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe('s-maxage=0');

    res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(BYPASS);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe('s-maxage=0');
  });

  test('`max-age=0, s-maxage=<value>` should not bypass cache', async () => {
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response('lol', {
          headers: {
            'cache-control': 'max-age=0, s-maxage=1',
          },
        });
      },
    });
    let res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(MISS);
    expect(res.headers.get('age')).toBe(null);
    expect(res.headers.get('cache-control')).toBe('max-age=0, s-maxage=1');

    res = await fetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(HIT);
    expect(res.headers.get('age')).toBe('0');
    expect(res.headers.get('cache-control')).toBe('max-age=0, s-maxage=1');
  });
});

describe('stale while revalidate', () => {
  describe('when the cache is stale', () => {
    let count = 0;
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response(`Hello ${count++}`, {
          headers: {
            'cache-control': 'max-age=1, stale-while-revalidate=2',
          },
        });
      },
    });

    test('step 1: the first request should load the latest response and cache it', async () => {
      const req = new Request(TEST_URL);
      const res = await fetch(req);
      const cachedRes = await cache.match(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache-status')).toBe(MISS);
      expect(res.headers.get('age')).toBe(null);
      expect(await res.text()).toBe('Hello 0');
      expect(await cachedRes?.text()).toBe('Hello 0');
    });

    test('step 2: content should be fetched from cache', async () => {
      const req = new Request(TEST_URL);
      const res = await fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache-status')).toBe(HIT);
      expect(res.headers.get('age')).toBe('0');
      expect(await res.text()).toBe('Hello 0');
    });

    test('step 3: use stale content and update cache in the background', async () => {
      // NOTE: Simulation exceeds max age
      await timeout(1016);

      const req = new Request(TEST_URL);
      const res = await fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache-status')).toBe(STALE);
      expect(res.headers.get('age')).toBe('1');
      expect(await res.text()).toBe('Hello 0');

      // NOTE: Wait for background update
      await timeout(16);

      const cachedRes = await cache.match(req);
      expect(await cachedRes?.text()).toBe('Hello 1');
    });

    test('step 4: the updated cache should be used', async () => {
      const req = new Request(TEST_URL);
      const res = await fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache-status')).toBe(HIT);
      expect(res.headers.get('age')).toBe('0');
      expect(await res.text()).toBe('Hello 1');
    });
  });

  describe('when the cache is expired', () => {
    let count = 0;
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch() {
        return new Response(`Hello ${count++}`, {
          headers: {
            'cache-control': 'max-age=1, stale-while-revalidate=1',
          },
        });
      },
    });

    test('step 1: the first request should load the latest response and cache it', async () => {
      const req = new Request(TEST_URL);
      const res = await fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache-status')).toBe(MISS);
      expect(res.headers.get('age')).toBe(null);
      expect(await res.text()).toBe('Hello 0');
    });

    test('step 2: content should be fetched from cache', async () => {
      const req = new Request(TEST_URL);
      const res = await fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache-status')).toBe(HIT);
      expect(res.headers.get('age')).toBe('0');
      expect(await res.text()).toBe('Hello 0');
    });

    test('step 3: reload the latest content and cache it after the cache expires', async () => {
      // NOTE: Simulation exceeds max age
      await timeout(2001);

      const req = new Request(TEST_URL);
      const res = await fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache-status')).toBe(MISS);
      expect(res.headers.get('age')).toBe(null);
      expect(await res.text()).toBe('Hello 1');
    });

    test('step 4: the updated cache should be used', async () => {
      const req = new Request(TEST_URL);
      const res = await fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache-status')).toBe(HIT);
      expect(res.headers.get('age')).toBe('0');
      expect(await res.text()).toBe('Hello 1');
    });
  });

  describe('stale if error', () => {
    let count = 0;
    const store = createCacheStore();
    const cache = new SharedCache(store);
    const fetch = createSharedCacheFetch(cache, {
      async fetch(input, init) {
        const req = new Request(input, init);
        if (req.headers.has('status-500')) {
          return new Response('Internal Server Error', { status: 500 });
        }
        return new Response(`Hello ${count++}`, {
          headers: {
            'cache-control':
              'max-age=1, stale-if-error=1, stale-while-revalidate=1',
          },
        });
      },
    });

    test('step 1: the first request should load the latest response and cache it', async () => {
      const req = new Request(TEST_URL);
      const res = await fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache-status')).toBe(MISS);
      expect(res.headers.get('age')).toBe(null);
      expect(await res.text()).toBe('Hello 0');
    });

    test('step 2: content should be fetched from cache', async () => {
      const req = new Request(TEST_URL);
      const res = await fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache-status')).toBe(HIT);
      expect(res.headers.get('age')).toBe('0');
      expect(await res.text()).toBe('Hello 0');
    });

    test('step 3: reloading encounters errors and should use caching', async () => {
      // NOTE: Simulation exceeds max age
      await timeout(1001);

      let req = new Request(TEST_URL);
      let res = await fetch(req, {
        headers: {
          'throw-error': 'true',
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache-status')).toBe(STALE);
      expect(res.headers.get('age')).toBe('1');
      expect(await res.text()).toBe('Hello 0');

      req = new Request(TEST_URL);
      res = await fetch(req, {
        headers: {
          'status-500': 'true',
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache-status')).toBe(STALE);
      expect(res.headers.get('age')).toBe('1');
      expect(await res.text()).toBe('Hello 0');
    });

    test('step 4: errors that last too long should bypass caching', async () => {
      // NOTE: Simulation exceeds max age
      await timeout(1008);

      const req = new Request(TEST_URL);
      const res = await fetch(req, {
        headers: {
          'status-500': 'true',
        },
      });

      expect(res.status).toBe(500);
      expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
      expect(res.headers.get('age')).toBe(null);
      expect(res.headers.get('cache-control')).toBe(null);
    });
  });
});
