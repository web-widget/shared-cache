import { LRUCache } from 'lru-cache';
import { SharedCache } from './cache';
import { SharedCacheStorage } from './cache-storage';
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

  it('Opens a cache', async () => {
    const cache1 = await cacheStorage.open('1');
    const cache2 = await cacheStorage.open('2');
    expect(cache1).toBeInstanceOf(SharedCache);
    expect(cache2).toBeInstanceOf(SharedCache);
    expect(cache2).not.toBe(cache1);
  });

  it('It Opens the same cache', async () => {
    const cache1 = await cacheStorage.open('1');
    const cache2 = await cacheStorage.open('1');
    expect(cache2).toBe(cache1);
  });
});
