import { SharedCache } from './cache';
import { SharedCacheOptions, KVStorage, WebCacheStorage } from './types';

/**
 * Named cache registry backed by a shared KV storage.
 * Only `open()` is implemented; other CacheStorage methods throw.
 */
export class SharedCacheStorage implements WebCacheStorage {
  #storage: KVStorage;
  #caches: Map<string, SharedCache> = new Map();
  #options?: SharedCacheOptions;

  constructor(storage: KVStorage, options?: SharedCacheOptions) {
    if (!storage) {
      throw new TypeError(
        'Storage backend is required for SharedCacheStorage.'
      );
    }

    this.#storage = storage;
    this.#options = options;
  }

  async delete(_cacheName: string): Promise<boolean> {
    throw new Error('SharedCacheStorage.delete() is not implemented.');
  }

  async has(_cacheName: string): Promise<boolean> {
    throw new Error('SharedCacheStorage.has() is not implemented.');
  }

  async keys(): Promise<string[]> {
    throw new Error('SharedCacheStorage.keys() is not implemented.');
  }

  async match(
    _request: RequestInfo,
    _options?: MultiCacheQueryOptions
  ): Promise<Response | undefined> {
    throw new Error('SharedCacheStorage.match() is not implemented.');
  }

  async open(cacheName: string): Promise<SharedCache> {
    const existingCache = this.#caches.get(cacheName);
    if (existingCache) {
      return existingCache;
    }

    const newCache = new SharedCache(this.#storage, {
      ...this.#options,
      _cacheName: cacheName,
    });

    this.#caches.set(cacheName, newCache);
    return newCache;
  }
}
