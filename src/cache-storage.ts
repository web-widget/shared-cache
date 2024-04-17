import { SharedCache } from './cache';
import { SharedCacheOptions, KVStorage } from './types';

export class SharedCacheStorage implements CacheStorage {
  #KVStorage: KVStorage;
  #caches: Map<string, SharedCache> = new Map();
  #options?: SharedCacheOptions;

  constructor(KVStorage: KVStorage, options?: SharedCacheOptions) {
    this.#KVStorage = KVStorage;
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

  /**
   * The has() method of the CacheStorage interface returns a Promise that
   * resolves to true if a Cache object matches the cacheName.
   * @param cacheName A string representing the name of the Cache object you are
   * looking for in the CacheStorage.
   * @returns a Promise that resolves to true if the cache exists or false if
   * not.
   */
  async has(_cacheName: string): Promise<boolean> {
    throw new Error('Not Implemented.');
  }

  /**
   * The keys() method of the CacheStorage interface returns a Promise that will
   * resolve with an array containing strings corresponding to all of the named
   * Cache objects tracked by the CacheStorage object in the order they were
   * created. Use this method to iterate over a list of all Cache objects.
   */
  async keys(): Promise<string[]> {
    throw new Error('Not Implemented.');
  }

  /**
   * The match() method of the CacheStorage interface checks if a given Request
   * or URL string is a key for a stored Response. This method returns a Promise
   * for a Response, or a Promise which resolves to undefined if no match is
   * found.
   * @param request The Request you want to match. This can be a Request object
   * or a URL string.
   * @param options An object whose properties control how matching is done in
   * the match operation. The available options are:
   */
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
  async open(cacheName: string): Promise<Cache> {
    const cache = this.#caches.get(cacheName);
    if (cache) {
      return cache;
    }
    const newOptions: SharedCacheOptions = {
      ...this.#options,
      _cacheName: cacheName,
    };
    const newCache = new SharedCache(this.#KVStorage, newOptions);
    this.#caches.set(cacheName, newCache);
    return newCache;
  }
}
