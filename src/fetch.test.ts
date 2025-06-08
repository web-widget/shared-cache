/**
 * Comprehensive test suite for the shared cache fetch implementation.
 * Tests HTTP caching semantics, error handling, and edge cases according to RFC 7234.
 *
 * Test Coverage:
 * - HTTP cache control directives and semantics
 * - Vary header handling and cache variations
 * - Stale-while-revalidate and stale-if-error behavior
 * - HTTP method caching rules (GET, HEAD, POST, etc.)
 * - Status code caching policies
 * - Edge cases and error handling
 * - Performance and concurrent request handling
 * - Standards compliance with HTTP/1.1 and related RFCs
 */

import { LRUCache } from 'lru-cache';
import { KVStorage } from './types';
import { createSharedCacheFetch } from './fetch';
import { SharedCache } from './cache';
import { BYPASS, DYNAMIC, EXPIRED, HIT, MISS, STALE } from './constants';

const TEST_URL = 'http://localhost/';

/**
 * Test utility functions
 */

/** Creates a mock LRU cache store for testing HTTP caching scenarios */
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

/** Creates a timeout promise for testing time-based cache scenarios */
const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * HTTP Cache Control Header Override Tests
 * Tests the ability to override cache-control and vary headers per RFC 7234
 */
describe('HTTP Header Override Tests', () => {
  describe('cache-control header override', () => {
    test('should override cache-control header with s-maxage directive', async () => {
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

      expect(res.headers.get('cache-control')).toBe(
        'max-age=300, s-maxage=120'
      );
      expect(res.headers.get('x-cache-status')).toBe(MISS);
    });

    test('should combine multiple cache-control directives correctly', async () => {
      const store = createCacheStore();
      const cache = new SharedCache(store);
      const fetch = createSharedCacheFetch(cache, {
        async fetch() {
          return new Response('test', {
            headers: {
              'cache-control': 'max-age=300, public',
            },
          });
        },
      });
      const res = await fetch(TEST_URL, {
        sharedCache: {
          cacheControlOverride: 's-maxage=600, must-revalidate',
        },
      });

      expect(res.headers.get('cache-control')).toBe(
        'max-age=300, public, s-maxage=600, must-revalidate'
      );
      expect(res.headers.get('x-cache-status')).toBe(MISS);
    });
  });

  describe('vary header override', () => {
    test('should override vary header with additional headers', async () => {
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

    test('should handle vary override when no original vary header exists', async () => {
      const store = createCacheStore();
      const cache = new SharedCache(store);
      const fetch = createSharedCacheFetch(cache, {
        async fetch() {
          return new Response('test', {
            headers: {
              'cache-control': 'max-age=300',
            },
          });
        },
      });
      const res = await fetch(TEST_URL, {
        sharedCache: {
          varyOverride: 'user-agent',
        },
      });

      expect(res.headers.get('vary')).toBe('user-agent');
      expect(res.headers.get('x-cache-status')).toBe(MISS);
    });
  });

  describe('header override restrictions', () => {
    test('should not set override headers for server error responses (5xx)', async () => {
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

    test('should not set override headers for 503 Service Unavailable', async () => {
      const store = createCacheStore();
      const cache = new SharedCache(store);
      const fetch = createSharedCacheFetch(cache, {
        async fetch() {
          return new Response('Service Unavailable', { status: 503 });
        },
      });
      const res = await fetch(TEST_URL, {
        sharedCache: {
          cacheControlOverride: 'max-age=60',
          varyOverride: 'accept-encoding',
        },
      });

      expect(res.headers.get('cache-control')).toBe(null);
      expect(res.headers.get('vary')).toBe(null);
      expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
    });
  });
});

/**
 * Multiple Duplicate Requests Test Suite
 * Tests caching behavior with repeated requests and different HTTP methods
 */
describe('Multiple Duplicate Requests', () => {
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

  test('subsequent GET requests should serve from cache with HIT status', async () => {
    const res = await fetch(TEST_URL);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/lol; charset=utf-8');
    expect(res.headers.get('x-cache-status')).toBe(HIT);
    expect(res.headers.get('etag')).toBe('"v1"');
    expect(await res.text()).toBe('lol');
  });

  test('POST method should not be cached and return DYNAMIC status', async () => {
    const res = await fetch(TEST_URL, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/lol; charset=utf-8');
    expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
    expect(res.headers.get('etag')).toBe('"v1"');
    expect(await res.text()).toBe('lol');
  });

  test('cache should persist until manually cleared', async () => {
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

    // Should still hit cache with old content
    const res = await fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/lol; charset=utf-8');
    expect(res.headers.get('x-cache-status')).toBe(HIT);
    expect(res.headers.get('etag')).toBe('"v1"');
    expect(await res.text()).toBe('lol');

    // Clear cache manually
    await cache.delete(req);

    // Should fetch new content after cache clear
    const newRes = await fetch(req);
    expect(newRes.status).toBe(200);
    expect(newRes.headers.get('content-type')).toBe('text/lol; charset=utf-8');
    expect(newRes.headers.get('x-cache-status')).toBe(MISS);
    expect(await newRes.text()).toBe('new content');
  });
});

/**
 * Basic Cache Control Tests
 * Tests fundamental caching behavior when no cache-control is present
 */
describe('Basic Cache Control Behavior', () => {
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
});

/**
 * Request Cache Control Directive Tests
 * Tests handling of cache-control directives from client requests
 */
describe('Request Cache Control Directives', () => {
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
      sharedCache: {
        ignoreRequestCacheControl: false,
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
      sharedCache: {
        ignoreRequestCacheControl: false,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(EXPIRED);
    expect(res.headers.get('age')).toBe('0');
    expect(res.headers.get('cache-control')).toBe('max-age=300');
    expect(await res.text()).toBe('lol');
  });
});

/**
 * Response Body Caching Tests
 * Tests caching behavior with different response body types
 */
describe('Response Body Caching', () => {
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
});

/**
 * HTTP Method-Specific Caching Tests
 * Tests caching behavior for different HTTP methods per RFC 7231
 */
describe('HTTP Method-Specific Caching', () => {
  test('HEAD method should read cache from GET request', async () => {
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

    const head1 = new Request(TEST_URL, {
      method: 'HEAD',
    });
    const head1Res = await fetch(head1);

    expect(head1Res.status).toBe(200);
    expect(await head1Res.text()).toBe('HEAD');
    expect(head1Res.headers.get('x-cache-status')).toBe(DYNAMIC);
    expect(await cache.match(head1)).toBeUndefined();

    await fetch(
      new Request(TEST_URL, {
        method: 'GET',
      })
    );

    const head2 = new Request(TEST_URL, {
      method: 'HEAD',
    });
    const head2Res = await fetch(head2);

    expect(head2Res.status).toBe(200);
    expect(await head2Res.text()).toBe('GET');
    expect(head2Res.headers.get('x-cache-status')).toBe(HIT);
    expect(await cache.match(head2)).toBeUndefined();
  });

  test('POST method should not cache the response', async () => {
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
    expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
    expect(await cache.match(post)).toBeUndefined();
  });
});

/**
 * Vary Header Handling Tests
 * Tests proper handling of Vary header for content negotiation per RFC 7234
 */
describe('Vary Header Handling', () => {
  describe('multiple versions should be cached based on vary header', () => {
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
  });

  test('it should be possible to turn off the `vary` feature', async () => {
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
    let res = await fetch(req, {
      sharedCache: {
        ignoreVary: true,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(MISS);
    expect(res.headers.get('vary')).toBe('accept-language');
    expect(await res.text()).toBe('en-us');

    res = await fetch(req, {
      sharedCache: {
        ignoreVary: true,
      },
    });
    expect(res.headers.get('x-cache-status')).toBe(HIT);

    req = new Request(TEST_URL, {
      headers: {
        'accept-language': 'tr-tr',
      },
    });
    res = await fetch(req, {
      sharedCache: {
        ignoreVary: true,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe(HIT);
    expect(res.headers.get('vary')).toBe('accept-language');
    expect(await res.text()).toBe('en-us');

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

  /**
   * Comprehensive test suite for HTTP caching edge cases and error handling
   */
  describe('HTTP Standards Compliance Tests', () => {
    describe('Edge Cases', () => {
      test('should handle malformed cache-control headers gracefully', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('test', {
              headers: {
                'cache-control': 'invalid-directive, max-age=abc, max-age=300',
              },
            });
          },
        });

        const res = await fetch(TEST_URL);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-cache-status')).toBe(MISS);
        expect(await res.text()).toBe('test');
      });

      test('should handle responses with no content-type', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('test', {
              headers: {
                'cache-control': 'max-age=300',
              },
            });
          },
        });

        const res = await fetch(TEST_URL);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-cache-status')).toBe(MISS);
        // Note: Response constructor adds default content-type
        expect(res.headers.get('content-type')).toBe(
          'text/plain;charset=UTF-8'
        );
        expect(await res.text()).toBe('test');
      });

      test('should handle very large max-age values', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('test', {
              headers: {
                'cache-control': 'max-age=2147483647', // Maximum 32-bit integer
              },
            });
          },
        });

        const res = await fetch(TEST_URL);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-cache-status')).toBe(MISS);

        const res2 = await fetch(TEST_URL);
        expect(res2.headers.get('x-cache-status')).toBe(HIT);
      });

      test('should handle case-insensitive header names', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('test', {
              headers: {
                'CACHE-CONTROL': 'max-age=300',
                VARY: 'Accept-Language',
                ETAG: '"test-123"',
              },
            });
          },
        });

        const res = await fetch(TEST_URL);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-cache-status')).toBe(MISS);
        expect(res.headers.get('cache-control')).toBe('max-age=300');
        expect(res.headers.get('vary')).toBe('Accept-Language');
        expect(res.headers.get('etag')).toBe('"test-123"');
      });

      test('should handle empty response bodies', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('', {
              headers: {
                'cache-control': 'max-age=300',
              },
            });
          },
        });

        const res = await fetch(TEST_URL);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-cache-status')).toBe(MISS);
        expect(await res.text()).toBe('');

        const res2 = await fetch(TEST_URL);
        expect(res2.headers.get('x-cache-status')).toBe(HIT);
        expect(await res2.text()).toBe('');
      });
    });

    describe('HTTP Method Handling', () => {
      test('should handle PUT method as non-cacheable', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('updated', {
              headers: {
                'cache-control': 'max-age=300',
              },
            });
          },
        });

        const res = await fetch(TEST_URL, { method: 'PUT' });
        expect(res.status).toBe(200);
        expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
        expect(await res.text()).toBe('updated');
      });

      test('should handle DELETE method as non-cacheable', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('deleted', {
              headers: {
                'cache-control': 'max-age=300',
              },
            });
          },
        });

        const res = await fetch(TEST_URL, { method: 'DELETE' });
        expect(res.status).toBe(200);
        expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
        expect(await res.text()).toBe('deleted');
      });

      test('should handle PATCH method as non-cacheable', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('patched', {
              headers: {
                'cache-control': 'max-age=300',
              },
            });
          },
        });

        const res = await fetch(TEST_URL, { method: 'PATCH' });
        expect(res.status).toBe(200);
        expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
        expect(await res.text()).toBe('patched');
      });
    });

    describe('Status Code Handling', () => {
      test('should not cache 404 responses without explicit cache headers', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('Not Found', { status: 404 });
          },
        });

        const res = await fetch(TEST_URL);
        expect(res.status).toBe(404);
        expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
        expect(await res.text()).toBe('Not Found');
      });

      test('should cache 404 responses with explicit cache headers', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('Not Found', {
              status: 404,
              headers: {
                'cache-control': 'max-age=300',
              },
            });
          },
        });

        const res = await fetch(TEST_URL);
        expect(res.status).toBe(404);
        expect(res.headers.get('x-cache-status')).toBe(MISS);
        expect(await res.text()).toBe('Not Found');

        const res2 = await fetch(TEST_URL);
        expect(res2.status).toBe(404);
        expect(res2.headers.get('x-cache-status')).toBe(HIT);
        expect(await res2.text()).toBe('Not Found');
      });

      test('should handle 301 redirects with caching', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response(null, {
              status: 301,
              headers: {
                location: 'https://example.com/new',
                'cache-control': 'max-age=300',
              },
            });
          },
        });

        const res = await fetch(TEST_URL);
        expect(res.status).toBe(301);
        expect(res.headers.get('x-cache-status')).toBe(MISS);
        expect(res.headers.get('location')).toBe('https://example.com/new');

        const res2 = await fetch(TEST_URL);
        expect(res2.status).toBe(301);
        expect(res2.headers.get('x-cache-status')).toBe(HIT);
        expect(res2.headers.get('location')).toBe('https://example.com/new');
      });
    });

    describe('Vary Header Complex Scenarios', () => {
      test('should handle multiple Vary headers', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch(input, init) {
            const req = new Request(input, init);
            const lang = req.headers.get('accept-language') || 'en';
            const encoding = req.headers.get('accept-encoding') || 'identity';
            return new Response(`${lang}-${encoding}`, {
              headers: {
                'cache-control': 'max-age=300',
                vary: 'Accept-Language, Accept-Encoding',
              },
            });
          },
        });

        // First combination
        const res1 = await fetch(TEST_URL, {
          headers: {
            'accept-language': 'en-US',
            'accept-encoding': 'gzip',
          },
        });
        expect(res1.headers.get('x-cache-status')).toBe(MISS);
        expect(await res1.text()).toBe('en-US-gzip');

        // Second combination
        const res2 = await fetch(TEST_URL, {
          headers: {
            'accept-language': 'fr-FR',
            'accept-encoding': 'gzip',
          },
        });
        expect(res2.headers.get('x-cache-status')).toBe(MISS);
        expect(await res2.text()).toBe('fr-FR-gzip');

        // First combination again (should hit cache)
        const res3 = await fetch(TEST_URL, {
          headers: {
            'accept-language': 'en-US',
            'accept-encoding': 'gzip',
          },
        });
        expect(res3.headers.get('x-cache-status')).toBe(HIT);
        expect(await res3.text()).toBe('en-US-gzip');
      });

      test('should handle Vary: * (uncacheable)', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('uncacheable', {
              headers: {
                'cache-control': 'max-age=300',
                vary: '*',
              },
            });
          },
        });

        const res = await fetch(TEST_URL);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-cache-status')).toBe(DYNAMIC);
        expect(await res.text()).toBe('uncacheable');

        const res2 = await fetch(TEST_URL);
        expect(res2.headers.get('x-cache-status')).toBe(DYNAMIC);
        expect(await res2.text()).toBe('uncacheable');
      });
    });

    describe('Error Handling', () => {
      test('should handle network errors gracefully', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            throw new Error('Network error');
          },
        });

        await expect(fetch(TEST_URL)).rejects.toThrow('Network error');
      });

      test('should handle fetch timeout errors', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            throw new Error('Request timeout');
          },
        });

        await expect(fetch(TEST_URL)).rejects.toThrow('Request timeout');
      });

      test('should propagate non-HTTP errors from fetch', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            throw new TypeError('Failed to fetch');
          },
        });

        await expect(fetch(TEST_URL)).rejects.toThrow('Failed to fetch');
      });
    });

    describe('Cache Configuration Options', () => {
      test('should respect ignoreRequestCacheControl option', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('test', {
              headers: {
                'cache-control': 'max-age=300',
              },
            });
          },
        });

        // First request to populate cache
        await fetch(TEST_URL);

        // Request with no-cache should bypass when ignoreRequestCacheControl is false
        const res1 = await fetch(TEST_URL, {
          headers: { 'cache-control': 'no-cache' },
          sharedCache: { ignoreRequestCacheControl: false },
        });
        expect(res1.headers.get('x-cache-status')).toBe(EXPIRED);

        // Request with no-cache should hit cache when ignoreRequestCacheControl is true
        const res2 = await fetch(TEST_URL, {
          headers: { 'cache-control': 'no-cache' },
          sharedCache: { ignoreRequestCacheControl: true },
        });
        expect(res2.headers.get('x-cache-status')).toBe(HIT);
      });

      test('should handle custom cache key rules', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('test', {
              headers: {
                'cache-control': 'max-age=300',
              },
            });
          },
        });

        const customKeyRules = {
          header: {
            include: ['custom-header'],
          },
        };

        const res = await fetch(TEST_URL, {
          headers: {
            'custom-header': 'value',
            authorization: 'Bearer token',
          },
          sharedCache: {
            cacheKeyRules: customKeyRules,
          },
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('x-cache-status')).toBe(MISS);
      });

      test('should not cache requests with Authorization header by default', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('authenticated content', {
              headers: {
                'cache-control': 'max-age=300',
                'content-type': 'application/json',
              },
            });
          },
        });

        // Request with Authorization header should not be cached
        const res1 = await fetch(TEST_URL, {
          headers: {
            authorization: 'Bearer token123',
          },
        });

        expect(res1.status).toBe(200);
        expect(res1.headers.get('x-cache-status')).toBe(MISS);
        expect(await res1.text()).toBe('authenticated content');

        // Second request should also go to origin (not cached)
        const res2 = await fetch(TEST_URL, {
          headers: {
            authorization: 'Bearer token123',
          },
        });

        expect(res2.status).toBe(200);
        expect(res2.headers.get('x-cache-status')).toBe(MISS);
        expect(await res2.text()).toBe('authenticated content');
      });

      test('should cache requests with Authorization header when response has public directive', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('public authenticated content', {
              headers: {
                'cache-control': 'public, max-age=300',
                'content-type': 'application/json',
              },
            });
          },
        });

        // Request with Authorization header but response with 'public' directive should be cached
        const res1 = await fetch(TEST_URL, {
          headers: {
            authorization: 'Bearer token123',
          },
        });

        expect(res1.status).toBe(200);
        expect(res1.headers.get('x-cache-status')).toBe(MISS);
        expect(await res1.text()).toBe('public authenticated content');

        // Second request should hit cache
        const res2 = await fetch(TEST_URL, {
          headers: {
            authorization: 'Bearer token123',
          },
        });

        expect(res2.status).toBe(200);
        expect(res2.headers.get('x-cache-status')).toBe(HIT);
        expect(await res2.text()).toBe('public authenticated content');
      });

      test('should cache requests with Authorization header when response has s-maxage directive', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('shared cache content', {
              headers: {
                'cache-control': 's-maxage=300',
                'content-type': 'application/json',
              },
            });
          },
        });

        // Request with Authorization header but response with 's-maxage' directive should be cached
        const res1 = await fetch(TEST_URL, {
          headers: {
            authorization: 'Bearer token123',
          },
        });

        expect(res1.status).toBe(200);
        expect(res1.headers.get('x-cache-status')).toBe(MISS);
        expect(await res1.text()).toBe('shared cache content');

        // Second request should hit cache
        const res2 = await fetch(TEST_URL, {
          headers: {
            authorization: 'Bearer token123',
          },
        });

        expect(res2.status).toBe(200);
        expect(res2.headers.get('x-cache-status')).toBe(HIT);
        expect(await res2.text()).toBe('shared cache content');
      });

      test('should cache requests with Authorization header when response has must-revalidate directive', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        const fetch = createSharedCacheFetch(cache, {
          async fetch() {
            return new Response('must revalidate content', {
              headers: {
                'cache-control': 'max-age=300, must-revalidate',
                'content-type': 'application/json',
              },
            });
          },
        });

        // Request with Authorization header but response with 'must-revalidate' directive should be cached
        const res1 = await fetch(TEST_URL, {
          headers: {
            authorization: 'Bearer token123',
          },
        });

        expect(res1.status).toBe(200);
        expect(res1.headers.get('x-cache-status')).toBe(MISS);
        expect(await res1.text()).toBe('must revalidate content');

        // Second request should hit cache
        const res2 = await fetch(TEST_URL, {
          headers: {
            authorization: 'Bearer token123',
          },
        });

        expect(res2.status).toBe(200);
        expect(res2.headers.get('x-cache-status')).toBe(HIT);
        expect(await res2.text()).toBe('must revalidate content');
      });

      test('should handle different Authorization headers as separate cache entries', async () => {
        const store = createCacheStore();
        const cache = new SharedCache(store);
        let requestCount = 0;

        const fetch = createSharedCacheFetch(cache, {
          async fetch(input, init) {
            requestCount++;
            const req = new Request(input, init);
            const authHeader = req.headers.get('authorization') || '';

            return new Response(`content for ${authHeader}`, {
              headers: {
                'cache-control': 'public, max-age=300',
                'content-type': 'text/plain',
              },
            });
          },
          defaults: {
            cacheKeyRules: {
              header: {
                include: ['authorization'], // Include Authorization header in cache key
              },
            },
          },
        });

        // Request with first Authorization token
        const res1 = await fetch(TEST_URL, {
          headers: {
            authorization: 'Bearer token1',
          },
        });

        expect(res1.status).toBe(200);
        expect(res1.headers.get('x-cache-status')).toBe(MISS);
        expect(await res1.text()).toBe('content for Bearer token1');

        // Request with second Authorization token (should be separate cache entry)
        const res2 = await fetch(TEST_URL, {
          headers: {
            authorization: 'Bearer token2',
          },
        });

        expect(res2.status).toBe(200);
        expect(res2.headers.get('x-cache-status')).toBe(MISS);
        expect(await res2.text()).toBe('content for Bearer token2');

        // Repeat first request (should hit cache)
        const res3 = await fetch(TEST_URL, {
          headers: {
            authorization: 'Bearer token1',
          },
        });

        expect(res3.status).toBe(200);
        expect(res3.headers.get('x-cache-status')).toBe(HIT);
        expect(await res3.text()).toBe('content for Bearer token1');

        // Repeat second request (should hit cache)
        const res4 = await fetch(TEST_URL, {
          headers: {
            authorization: 'Bearer token2',
          },
        });

        expect(res4.status).toBe(200);
        expect(res4.headers.get('x-cache-status')).toBe(HIT);
        expect(await res4.text()).toBe('content for Bearer token2');

        expect(requestCount).toBe(2); // Only 2 requests to origin
      });
    });
  });

  /**
   * Performance and edge case tests
   */
  describe('Performance and Edge Cases', () => {
    test('should handle rapid sequential requests efficiently', async () => {
      const store = createCacheStore();
      const cache = new SharedCache(store);
      let fetchCount = 0;

      const fetch = createSharedCacheFetch(cache, {
        async fetch() {
          fetchCount++;
          return new Response(`count-${fetchCount}`, {
            headers: {
              'cache-control': 'max-age=300',
            },
          });
        },
      });

      // Make many rapid sequential requests
      const responses = [];
      for (let i = 0; i < 10; i++) {
        responses.push(await fetch(TEST_URL));
      }

      // First should be MISS, rest should be HIT
      expect(responses[0].headers.get('x-cache-status')).toBe(MISS);
      for (let i = 1; i < responses.length; i++) {
        expect(responses[i].headers.get('x-cache-status')).toBe(HIT);
      }

      expect(fetchCount).toBe(1);
    });

    test('should handle URL with query parameters correctly', async () => {
      const store = createCacheStore();
      const cache = new SharedCache(store);

      const fetch = createSharedCacheFetch(cache, {
        async fetch(input) {
          let url: string;
          if (typeof input === 'string') {
            url = input;
          } else if (input instanceof URL) {
            url = input.href;
          } else {
            url = input.url;
          }
          const parsedUrl = new URL(url);
          return new Response(`query: ${parsedUrl.search}`, {
            headers: {
              'cache-control': 'max-age=300',
            },
          });
        },
      });

      // Different query parameters should be cached separately
      const res1 = await fetch(`${TEST_URL}?param=1`);
      expect(res1.headers.get('x-cache-status')).toBe(MISS);
      expect(await res1.text()).toBe('query: ?param=1');

      const res2 = await fetch(`${TEST_URL}?param=2`);
      expect(res2.headers.get('x-cache-status')).toBe(MISS);
      expect(await res2.text()).toBe('query: ?param=2');

      // Same query should hit cache
      const res3 = await fetch(`${TEST_URL}?param=1`);
      expect(res3.headers.get('x-cache-status')).toBe(HIT);
      expect(await res3.text()).toBe('query: ?param=1');
    });

    test('should handle URLs with fragments correctly', async () => {
      const store = createCacheStore();
      const cache = new SharedCache(store);

      const fetch = createSharedCacheFetch(cache, {
        async fetch() {
          return new Response('fragment test', {
            headers: {
              'cache-control': 'max-age=300',
            },
          });
        },
      });

      // Fragments should be ignored for caching
      const res1 = await fetch(`${TEST_URL}#section1`);
      expect(res1.headers.get('x-cache-status')).toBe(MISS);

      const res2 = await fetch(`${TEST_URL}#section2`);
      expect(res2.headers.get('x-cache-status')).toBe(HIT);

      const res3 = await fetch(TEST_URL);
      expect(res3.headers.get('x-cache-status')).toBe(HIT);
    });
  });
});
