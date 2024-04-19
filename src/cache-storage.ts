import { SharedCache } from './cache';
import { SharedCacheOptions, KVStorage } from './types';

export class SharedCacheStorage implements CacheStorage {
  #storage: KVStorage;
  #caches: Map<string, SharedCache> = new Map();
  #options?: SharedCacheOptions;

  constructor(storage: KVStorage, options?: SharedCacheOptions) {
    this.#storage = storage;
    this.#options = options;
  }

  /**
   * The delete() method of the CacheStorage interface finds the Cache object
   * matching the cacheName, and if found, deletes the Cache object and returns
   * a Promise that resolves to true. If no Cache object is found, it resolves
   * to false.
   * @param cacheName The name of the cache you want to delete.
   */
  async delete(cacheName: string): Promise<boolean> {
    const hasCache = this.#caches.has(cacheName);
    if (hasCache) {
      this.#caches.delete(cacheName);
    }
    return hasCache;
  }

  /** @private */
  async has(_cacheName: string): Promise<boolean> {
    throw new Error('Not Implemented.');
  }

  /** @private */
  async keys(): Promise<string[]> {
    throw new Error('Not Implemented.');
  }

  /** @private */
  async match(
    _request: RequestInfo,
    _options?: MultiCacheQueryOptions
  ): Promise<Response | undefined> {
    throw new Error('Not Implemented.');
  }

  /**
   * The open() method of the CacheStorage interface returns a Promise that
   * resolves to the Cache object matching the cacheName.
   * @param cacheName The name of the cache you want to open.
   * @returns A Promise that resolves to the requested Cache object.
   */
  async open(cacheName: string): Promise<SharedCache> {
    const cache = this.#caches.get(cacheName);
    if (cache) {
      return cache;
    }
    const newOptions: SharedCacheOptions = {
      ...this.#options,
      _cacheName: cacheName,
    };
    const newCache = new SharedCache(this.#storage, newOptions);
    this.#caches.set(cacheName, newCache);
    return newCache;
  }
}
