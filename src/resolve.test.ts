import { LRUCache } from 'lru-cache';
import { SharedCache } from './cache';
import { BYPASS, DYNAMIC, HIT, MISS, STALE } from './constants';
import { createCacheHandler, resolveWithCache } from './resolve';
import type {
  CacheOriginHandler,
  KVStorage,
  SharedCacheRequest,
} from './types';

const TEST_URL = 'http://localhost/';
const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

function createRequest(url: string = TEST_URL): SharedCacheRequest {
  return new Request(url) as SharedCacheRequest;
}

describe('resolveWithCache', () => {
  let cache: SharedCache;

  beforeEach(() => {
    cache = new SharedCache(createCacheStore());
  });

  it('should cache a successful miss-phase origin response', async () => {
    const origin: CacheOriginHandler = () =>
      new Response('cached-body', {
        headers: { 'cache-control': 'max-age=60' },
      });

    const first = await resolveWithCache(cache, createRequest(), origin);
    const second = await resolveWithCache(cache, createRequest(), origin);

    expect(first.headers.get('x-cache-status')).toBe(MISS);
    expect(second.headers.get('x-cache-status')).toBe(HIT);
    expect(await first.text()).toBe('cached-body');
    expect(await second.text()).toBe('cached-body');
  });

  it('should propagate miss-phase origin throws', async () => {
    const origin: CacheOriginHandler = () => {
      throw new Error('miss failure');
    };

    await expect(
      resolveWithCache(cache, createRequest(), origin)
    ).rejects.toThrow('miss failure');
  });

  it('should mark responses without cache-control as dynamic', async () => {
    const origin: CacheOriginHandler = () => new Response('dynamic-body');

    const response = await resolveWithCache(cache, createRequest(), origin);

    expect(response.headers.get('x-cache-status')).toBe(DYNAMIC);
    expect(await response.text()).toBe('dynamic-body');
  });

  it('should bypass cache storage for no-store responses', async () => {
    const origin: CacheOriginHandler = () =>
      new Response('bypass-body', {
        headers: { 'cache-control': 'no-store' },
      });

    const first = await resolveWithCache(cache, createRequest(), origin);
    const second = await resolveWithCache(cache, createRequest(), origin);

    expect(first.headers.get('x-cache-status')).toBe(BYPASS);
    expect(second.headers.get('x-cache-status')).toBe(BYPASS);
  });

  it('should apply cache-control overrides only on successful responses', async () => {
    const origin: CacheOriginHandler = () =>
      new Response('error-body', { status: 500 });

    const response = await resolveWithCache(cache, createRequest(), origin, {
      cacheControlOverride: 's-maxage=120',
    });

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBeNull();
  });

  it('should apply cache-control overrides on successful miss responses', async () => {
    const origin: CacheOriginHandler = () =>
      new Response('ok', {
        headers: { 'cache-control': 'max-age=60' },
      });

    const response = await resolveWithCache(cache, createRequest(), origin, {
      cacheControlOverride: 's-maxage=120',
    });

    expect(response.headers.get('cache-control')).toBe(
      'max-age=60, s-maxage=120'
    );
  });

  it('should pass miss and revalidate phases to the origin handler', async () => {
    const phases: string[] = [];
    const origin: CacheOriginHandler = (_request, context) => {
      phases.push(context.phase);
      return new Response(`phase:${context.phase}`, {
        headers: { 'cache-control': 'max-age=1, stale-if-error=60' },
      });
    };

    await resolveWithCache(cache, createRequest(), origin);
    await timeout(1100);
    await resolveWithCache(cache, createRequest(), origin);

    expect(phases).toEqual(['miss', 'revalidate']);
  });

  it('should serve stale content when revalidation throws and stale-if-error applies', async () => {
    const origin: CacheOriginHandler = (_request, context) => {
      if (context.phase === 'revalidate') {
        throw new Error('revalidate failed');
      }
      return new Response('stale-body', {
        headers: { 'cache-control': 'max-age=1, stale-if-error=60' },
      });
    };

    await resolveWithCache(cache, createRequest(), origin);
    await timeout(1100);

    const response = await resolveWithCache(cache, createRequest(), origin);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-cache-status')).toBe(STALE);
    expect(await response.text()).toBe('stale-body');
  });

  it('should propagate the outer abort signal during miss-phase origin calls', async () => {
    const controller = new AbortController();
    const origin: CacheOriginHandler = () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(new Response('late')), 50);
      });

    const pending = resolveWithCache(cache, createRequest(), origin, {
      signal: controller.signal,
    });

    controller.abort(new Error('miss aborted'));

    await expect(pending).rejects.toThrow('miss aborted');
  });

  it('should apply vary override on successful miss responses', async () => {
    const origin: CacheOriginHandler = () =>
      new Response('ok', {
        headers: { 'cache-control': 'max-age=60' },
      });

    const response = await resolveWithCache(cache, createRequest(), origin, {
      varyOverride: 'accept-language',
    });

    expect(response.headers.get('vary')).toBe('accept-language');
  });

  it('should expose an effective cache key on cache hit when debugCacheKey is enabled', async () => {
    const origin: CacheOriginHandler = () =>
      new Response('vary-body', {
        headers: {
          'cache-control': 'max-age=60',
          vary: 'accept-language',
        },
      });

    await resolveWithCache(cache, createRequest(), origin, {
      debugCacheKey: true,
    });

    const response = await resolveWithCache(cache, createRequest(), origin, {
      debugCacheKey: true,
    });

    expect(response.headers.get('x-cache-status')).toBe(HIT);
    expect(response.headers.get('x-cache-key')).toContain('localhost/');
  });

  it('should skip vary-specific cache key suffixes when ignoreVary is enabled', async () => {
    const origin: CacheOriginHandler = () =>
      new Response('vary-body', {
        headers: {
          'cache-control': 'max-age=60',
          vary: 'accept-language',
        },
      });

    await resolveWithCache(cache, createRequest(), origin, {
      debugCacheKey: true,
      ignoreVary: true,
    });

    const response = await resolveWithCache(cache, createRequest(), origin, {
      debugCacheKey: true,
      ignoreVary: true,
    });

    expect(response.headers.get('x-cache-key')).toBe('localhost/');
  });

  it('should keep the base cache key when vary is wildcard', async () => {
    const origin: CacheOriginHandler = () =>
      new Response('wildcard-vary', {
        headers: {
          'cache-control': 'max-age=60',
          vary: '*',
        },
      });

    await resolveWithCache(cache, createRequest(), origin, {
      debugCacheKey: true,
    });

    const response = await resolveWithCache(cache, createRequest(), origin, {
      debugCacheKey: true,
    });

    expect(response.headers.get('x-cache-key')).toBe('localhost/');
  });

  it('should serve stale content when revalidation aborts via outer signal', async () => {
    const controller = new AbortController();
    const origin: CacheOriginHandler = (_request, context) => {
      if (context.phase === 'revalidate') {
        return new Response('should-not-be-used', { status: 500 });
      }
      return new Response('stale-body', {
        headers: { 'cache-control': 'max-age=1, stale-if-error=60' },
      });
    };

    await resolveWithCache(cache, createRequest(), origin);
    await timeout(1100);

    controller.abort(new Error('revalidate aborted'));

    const response = await resolveWithCache(cache, createRequest(), origin, {
      signal: controller.signal,
    });

    expect(response.headers.get('x-cache-status')).toBe(STALE);
    expect(await response.text()).toBe('stale-body');
  });
});

describe('createCacheHandler', () => {
  it('should merge defaults with per-call options', async () => {
    const cache = new SharedCache(createCacheStore());
    const handler = createCacheHandler(cache, {
      cacheControlOverride: 's-maxage=30',
    });

    const response = await handler.resolve(
      createRequest(),
      () =>
        new Response('handler-body', {
          headers: { 'cache-control': 'max-age=10' },
        }),
      {
        debugCacheKey: true,
      }
    );

    expect(response.headers.get('cache-control')).toBe(
      'max-age=10, s-maxage=30'
    );
    expect(response.headers.get('x-cache-key')).toBe('localhost/');
  });
});
