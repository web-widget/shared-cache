import { LRUCache } from 'lru-cache';
import { SharedCache } from './cache';
import { SharedCacheStorage } from './storage';
import { KVStorage } from './types';

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

describe('SharedCacheStorage', () => {
  let cacheStorage: SharedCacheStorage;

  beforeEach(() => {
    cacheStorage = new SharedCacheStorage(createCacheStore());
  });

  it('should require a storage backend', () => {
    expect(() => new SharedCacheStorage(null as unknown as KVStorage)).toThrow(
      'Storage backend is required for SharedCacheStorage.'
    );
  });

  it('should reject unimplemented CacheStorage methods', async () => {
    await expect(cacheStorage.delete('api')).rejects.toThrow(
      'SharedCacheStorage.delete() is not implemented.'
    );
    await expect(cacheStorage.has('api')).rejects.toThrow(
      'SharedCacheStorage.has() is not implemented.'
    );
    await expect(cacheStorage.keys()).rejects.toThrow(
      'SharedCacheStorage.keys() is not implemented.'
    );
    await expect(cacheStorage.match('http://localhost/')).rejects.toThrow(
      'SharedCacheStorage.match() is not implemented.'
    );
  });

  it('should inherit default options when opening caches', async () => {
    const storage = new SharedCacheStorage(createCacheStore(), {
      cacheKeyRules: { search: false },
    });
    const cache = await storage.open('api');

    const key = await cache.getCacheKey(new Request('http://localhost/?a=1'));
    expect(key).toBe('http://localhost/');
  });

  it('should open a cache', async () => {
    const cache1 = await cacheStorage.open('1');
    const cache2 = await cacheStorage.open('2');
    expect(cache1).toBeInstanceOf(SharedCache);
    expect(cache2).toBeInstanceOf(SharedCache);
    expect(cache2).not.toBe(cache1);
  });

  it('should open the same cache', async () => {
    const cache1 = await cacheStorage.open('1');
    const cache2 = await cacheStorage.open('1');
    expect(cache2).toBe(cache1);
  });

  it('should isolate named caches while keeping URL-shaped keys', async () => {
    const cache1 = await cacheStorage.open('api-v1');
    const cache2 = await cacheStorage.open('static');

    const request = new Request('http://localhost/resource');
    const key1 = await cache1.getCacheKey(request);
    const key2 = await cache2.getCacheKey(request);

    expect(key1).toBe('http://localhost/resource');
    expect(key2).toBe(key1);

    const cacheable = (body: string) =>
      new Response(body, {
        headers: { 'cache-control': 'max-age=300' },
      });

    await cache1.put(request, cacheable('from api'));
    await cache2.put(request, cacheable('from static'));

    expect(await (await cache1.match(request))!.text()).toBe('from api');
    expect(await (await cache2.match(request))!.text()).toBe('from static');
  });
});
