import { SharedCache } from './cache';
import { SharedCacheOptions, KVStorage } from './types';

/**
 * SharedCacheStorage implements the CacheStorage interface for managing multiple named caches.
 *
 * This implementation provides a shared cache storage system that maintains multiple
 * named cache instances backed by a single key-value storage system. It follows the
 * Web API CacheStorage specification while adding shared caching capabilities.
 *
 * Features:
 * - Named cache management with automatic instance creation
 * - Shared storage backend across all cache instances
 * - Lazy cache initialization for better performance
 * - Memory-efficient cache instance reuse
 *
 * @example
 * ```typescript
 * const storage = new MyKVStorage();
 * const cacheStorage = new SharedCacheStorage(storage);
 * const apiCache = await cacheStorage.open('api');
 * const staticCache = await cacheStorage.open('static');
 * ```
 */
export class SharedCacheStorage implements CacheStorage {
  /** The underlying key-value storage backend */
  #storage: KVStorage;

  /** Map of cache name to cache instance for reuse */
  #caches: Map<string, SharedCache> = new Map();

  /** Default options for created cache instances */
  #options?: SharedCacheOptions;

  /**
   * Creates a new SharedCacheStorage instance.
   *
   * @param storage - The key-value storage backend to use for all caches
   * @param options - Optional default configuration for created cache instances
   * @throws {TypeError} When storage is not provided
   */
  constructor(storage: KVStorage, options?: SharedCacheOptions) {
    if (!storage) {
      throw new TypeError(
        'Storage backend is required for SharedCacheStorage.'
      );
    }

    this.#storage = storage;
    this.#options = options;
  }

  /**
   * Deletes a named cache and all its contents.
   *
   * This method removes a cache by name and cleans up all associated data.
   * The operation is atomic - either the entire cache is deleted or none of it.
   *
   * Note: This implementation is currently not available and will throw an error.
   * Future versions may implement cache deletion with proper cleanup of storage keys.
   *
   * @param _cacheName - The name of the cache to delete
   * @returns Promise resolving to true if cache was deleted, false if it didn't exist
   * @throws {Error} Always throws as this method is not yet implemented
   */
  async delete(_cacheName: string): Promise<boolean> {
    throw new Error(
      'SharedCacheStorage.delete() is not implemented. ' +
        'Cache deletion requires careful cleanup of storage keys and is not yet supported.'
    );
  }

  /**
   * Checks if a named cache exists.
   *
   * This method determines whether a cache with the given name exists in storage.
   *
   * Note: This implementation is currently not available and will throw an error.
   * Future versions may implement cache existence checking.
   *
   * @param _cacheName - The name of the cache to check
   * @returns Promise resolving to true if cache exists, false otherwise
   * @throws {Error} Always throws as this method is not yet implemented
   */
  async has(_cacheName: string): Promise<boolean> {
    throw new Error(
      'SharedCacheStorage.has() is not implemented. ' +
        'Cache existence checking is not yet supported.'
    );
  }

  /**
   * Returns all cache names.
   *
   * This method lists all cache names that exist in storage.
   *
   * Note: This implementation is currently not available and will throw an error.
   * Future versions may implement cache enumeration.
   *
   * @returns Promise resolving to array of cache names
   * @throws {Error} Always throws as this method is not yet implemented
   */
  async keys(): Promise<string[]> {
    throw new Error(
      'SharedCacheStorage.keys() is not implemented. ' +
        'Cache enumeration is not yet supported.'
    );
  }

  /**
   * Searches across all caches for a matching request.
   *
   * This method performs a cross-cache search to find a cached response
   * that matches the given request. It's useful for scenarios where
   * content might be cached in multiple named caches.
   *
   * Note: This implementation is currently not available and will throw an error.
   * Future versions may implement cross-cache matching.
   *
   * @param _request - The request to match against
   * @param _options - Optional query options for the search
   * @returns Promise resolving to matching response or undefined
   * @throws {Error} Always throws as this method is not yet implemented
   */
  async match(
    _request: RequestInfo,
    _options?: MultiCacheQueryOptions
  ): Promise<Response | undefined> {
    throw new Error(
      'SharedCacheStorage.match() is not implemented. ' +
        'Cross-cache matching is not yet supported.'
    );
  }

  /**
   * Opens or creates a named cache instance.
   *
   * This method implements the CacheStorage.open() specification, returning
   * a Promise that resolves to a Cache object matching the given name.
   *
   * The implementation includes:
   * - Automatic cache instance creation for new names
   * - Instance reuse for existing cache names (singleton pattern)
   * - Proper cache configuration inheritance from storage options
   * - Memory-efficient lazy initialization
   *
   * Cache instances share the same storage backend but use prefixed keys
   * to maintain isolation between different named caches.
   *
   * @param cacheName - The name of the cache to open or create
   * @returns Promise resolving to the requested SharedCache instance
   *
   * @example
   * ```typescript
   * const apiCache = await cacheStorage.open('api-v1');
   * const staticCache = await cacheStorage.open('static-assets');
   * // Same cache name returns the same instance
   * const sameCache = await cacheStorage.open('api-v1');
   * console.log(apiCache === sameCache); // true
   * ```
   */
  async open(cacheName: string): Promise<SharedCache> {
    // Return existing cache instance if already created
    const existingCache = this.#caches.get(cacheName);
    if (existingCache) {
      return existingCache;
    }

    // Create new cache instance with inherited options
    const cacheOptions: SharedCacheOptions = {
      ...this.#options,
      _cacheName: cacheName,
    };

    const newCache = new SharedCache(this.#storage, cacheOptions);

    // Store instance for reuse
    this.#caches.set(cacheName, newCache);

    return newCache;
  }
}
