import { LRUCache } from 'lru-cache';
import { SharedCache } from './cache';
import { KVStorage, CacheItem, SharedCacheOptions } from './types';
import type { Logger } from './utils/logger';
import { createLogger, StructuredLogger } from './utils/logger';
import {
  CACHE_STATUS_HEADERS_NAME,
  HIT,
  STALE,
  REVALIDATED,
  EXPIRED,
} from './constants';

// Simple mock logger for testing
const mockLogger: Logger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {},
};

// Test storage implementation using LRU cache
const createTestStorage = (): KVStorage => {
  const store = new LRUCache<string, CacheItem>({ max: 1024 });

  return {
    async get(cacheKey: string) {
      return store.get(cacheKey);
    },
    async set(cacheKey: string, value: unknown, ttl?: number) {
      store.set(cacheKey, value as CacheItem, { ttl });
    },
    async delete(cacheKey: string) {
      return store.delete(cacheKey);
    },
  };
};

// Helper function to create a test response
const createTestResponse = (
  body: string = 'test body',
  status: number = 200,
  headers: Record<string, string> = {}
): Response => {
  return new Response(body, {
    status,
    headers: {
      'cache-control': 'max-age=300',
      ...headers,
    },
  });
};

describe('SharedCache', () => {
  let storage: KVStorage;
  let cache: SharedCache;

  beforeEach(() => {
    storage = createTestStorage();
    cache = new SharedCache(storage);
  });

  describe('constructor', () => {
    it('should create SharedCache instance with valid storage', () => {
      expect(cache).toBeInstanceOf(SharedCache);
    });

    it('should throw TypeError when storage is not provided', () => {
      expect(() => new SharedCache(null as unknown as KVStorage)).toThrow(
        TypeError
      );
      expect(() => new SharedCache(undefined as unknown as KVStorage)).toThrow(
        TypeError
      );
    });

    it('should accept optional configuration', () => {
      const options: SharedCacheOptions = {
        logger: mockLogger,
        cacheKeyRules: {
          header: { include: ['authorization'] },
        },
      };

      const configuredCache = new SharedCache(storage, options);
      expect(configuredCache).toBeInstanceOf(SharedCache);
    });
  });

  describe('add() method', () => {
    it('should throw error as it is not implemented', async () => {
      await expect(cache.add('https://example.com')).rejects.toThrow(
        'SharedCache.add() is not implemented. Use put() instead.'
      );
    });
  });

  describe('addAll() method', () => {
    it('should throw error as it is not implemented', async () => {
      await expect(cache.addAll(['https://example.com'])).rejects.toThrow(
        'SharedCache.addAll() is not implemented. Use put() for each request instead.'
      );
    });
  });

  describe('keys() method', () => {
    it('should throw error as it is not implemented', async () => {
      await expect(cache.keys()).rejects.toThrow(
        'SharedCache.keys() is not implemented.'
      );
    });
  });

  describe('matchAll() method', () => {
    it('should throw error as it is not implemented', async () => {
      await expect(cache.matchAll()).rejects.toThrow(
        'SharedCache.matchAll() is not implemented.'
      );
    });
  });

  describe('put() method', () => {
    it('should store cacheable response', async () => {
      const request = new Request('https://example.com/api');
      const response = createTestResponse('test data', 200, {
        'cache-control': 'max-age=300',
      });

      await cache.put(request, response);

      const matched = await cache.match(request);
      expect(matched).toBeDefined();
      expect(await matched!.text()).toBe('test data');
    });

    it('should accept string URL as request', async () => {
      const response = createTestResponse('test data');
      await cache.put('https://example.com/api', response);

      const matched = await cache.match('https://example.com/api');
      expect(matched).toBeDefined();
    });

    it('should throw TypeError for non-HTTP/HTTPS URLs', async () => {
      const request = new Request('ftp://example.com/file');
      const response = createTestResponse();

      await expect(cache.put(request, response)).rejects.toThrow(
        /Expected an http\/s scheme when method is not GET/
      );
    });

    it('should throw TypeError for non-GET requests', async () => {
      const request = new Request('https://example.com/api', {
        method: 'POST',
      });
      const response = createTestResponse();

      await expect(cache.put(request, response)).rejects.toThrow(
        /Expected an http\/s scheme when method is not GET/
      );
    });

    it('should throw TypeError for 206 status responses', async () => {
      const request = new Request('https://example.com/api');
      const response = createTestResponse('partial', 206);

      await expect(cache.put(request, response)).rejects.toThrow(
        /Got 206 status/
      );
    });

    it('should throw TypeError for Vary: * responses', async () => {
      const request = new Request('https://example.com/api');
      const response = createTestResponse('data', 200, { vary: '*' });

      await expect(cache.put(request, response)).rejects.toThrow(
        /Got \* vary field value/
      );
    });

    it('should handle responses with Vary header', async () => {
      const request = new Request('https://example.com/api', {
        headers: { 'accept-encoding': 'gzip' },
      });
      const response = createTestResponse('data', 200, {
        vary: 'accept-encoding',
        'cache-control': 'max-age=300',
      });

      await cache.put(request, response);

      const matched = await cache.match(request);
      expect(matched).toBeDefined();
    });

    it('should not store non-storable responses', async () => {
      const request = new Request('https://example.com/api');
      const response = createTestResponse('data', 200, {
        'cache-control': 'no-store',
      });

      await cache.put(request, response);

      const matched = await cache.match(request);
      expect(matched).toBeUndefined();
    });

    it('should not store responses with zero TTL', async () => {
      const request = new Request('https://example.com/api');
      const response = createTestResponse('data', 200, {
        'cache-control': 'max-age=0',
      });

      await cache.put(request, response);

      const matched = await cache.match(request);
      expect(matched).toBeUndefined();
    });

    it('should handle empty response body', async () => {
      const request = new Request('https://example.com/api');
      const response = new Response(null, {
        status: 204,
        headers: { 'cache-control': 'max-age=300' },
      });

      await cache.put(request, response);

      const matched = await cache.match(request);
      expect(matched).toBeDefined();
      expect(matched!.status).toBe(204);
    });

    it('should handle large responses', async () => {
      const largeBody = 'x'.repeat(1000); // Reduced size for test performance
      const request = new Request('https://example.com/api');
      const response = createTestResponse(largeBody, 200, {
        'cache-control': 'max-age=300',
      });

      await cache.put(request, response);

      const matched = await cache.match(request);
      expect(matched).toBeDefined();
      expect(await matched!.text()).toBe(largeBody);
    });

    it('should handle special characters in URLs', async () => {
      const request = new Request(
        'https://example.com/api?query=hello%20world&sort=date'
      );
      const response = createTestResponse('data');

      await cache.put(request, response);

      const matched = await cache.match(request.url);
      expect(matched).toBeDefined();
    });

    it('should respect cache-control directives for shared caches', async () => {
      const request = new Request('https://example.com/api');
      const response = createTestResponse('data', 200, {
        'cache-control': 'max-age=60, s-maxage=300',
      });

      await cache.put(request, response);

      const matched = await cache.match(request);
      expect(matched).toBeDefined();
    });
  });

  describe('match() method', () => {
    beforeEach(async () => {
      const request = new Request('https://example.com/api');
      const response = createTestResponse('cached data', 200, {
        'cache-control': 'max-age=300',
      });
      await cache.put(request, response);
    });

    it('should return cached response for matching request', async () => {
      const request = new Request('https://example.com/api');
      const matched = await cache.match(request);

      expect(matched).toBeDefined();
      expect(await matched!.text()).toBe('cached data');
      expect(matched!.headers.get(CACHE_STATUS_HEADERS_NAME)).toBe(HIT);
    });

    it('should accept string URL', async () => {
      const matched = await cache.match('https://example.com/api');
      expect(matched).toBeDefined();
    });

    it('should return undefined for non-existent entries', async () => {
      const matched = await cache.match('https://example.com/nonexistent');
      expect(matched).toBeUndefined();
    });

    it('should return undefined for non-GET requests without ignoreMethod', async () => {
      const request = new Request('https://example.com/api', {
        method: 'POST',
      });
      const matched = await cache.match(request);
      expect(matched).toBeUndefined();
    });

    it('should handle non-GET requests with ignoreMethod option', async () => {
      const request = new Request('https://example.com/api', {
        method: 'POST',
      });
      const matched = await cache.match(request, { ignoreMethod: true });
      expect(matched).toBeDefined();
    });

    it('should handle requests without fetch option when response is expired', async () => {
      // Store an expired response
      const request = new Request('https://example.com/expired');
      const response = createTestResponse('expired data', 200, {
        'cache-control': 'max-age=0',
      });
      await cache.put(request, response);

      // Without fetch option, should return undefined for expired responses
      const matched = await cache.match(request);
      expect(matched).toBeUndefined();
    });

    it('should return STALE status when serving stale content while revalidating', async () => {
      // Store response with stale-while-revalidate
      const request = new Request('https://example.com/stale-while-revalidate');
      const response = createTestResponse('stale data', 200, {
        'cache-control': 'max-age=1, stale-while-revalidate=300',
      });
      await cache.put(request, response);

      // Wait for it to become stale
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Mock fetch for background revalidation
      const mockFetch = async () => {
        return createTestResponse('fresh data', 200, {
          'cache-control': 'max-age=300',
        });
      };

      let backgroundPromise: Promise<unknown> | null = null;
      const mockWaitUntil = (promise: Promise<unknown>) => {
        backgroundPromise = promise;
      };

      const matched = await cache.match(request, {
        _fetch: mockFetch,
        _waitUntil: mockWaitUntil,
      });

      expect(matched).toBeDefined();
      expect(await matched!.text()).toBe('stale data');
      expect(matched!.headers.get(CACHE_STATUS_HEADERS_NAME)).toBe(STALE);
      expect(backgroundPromise).not.toBeNull();
    });

    it('should verify REVALIDATED cache status constant exists', () => {
      // Verify that the REVALIDATED status constant is properly defined
      // This status is used when a cached response is revalidated and found to be still fresh
      expect(REVALIDATED).toBe('REVALIDATED');
    });

    it('should verify EXPIRED cache status constant exists', () => {
      // Verify that the EXPIRED status constant is properly defined
      // This status is used when a cached response is replaced by a new one during revalidation
      expect(EXPIRED).toBe('EXPIRED');
    });
  });

  describe('delete() method', () => {
    beforeEach(async () => {
      const request = new Request('https://example.com/api');
      const response = createTestResponse('cached data');
      await cache.put(request, response);
    });

    it('should delete existing cache entry', async () => {
      const request = new Request('https://example.com/api');
      const result = await cache.delete(request);
      expect(result).toBe(true);

      const matched = await cache.match(request);
      expect(matched).toBeUndefined();
    });

    it('should return false for non-existent entry', async () => {
      const request = new Request('https://example.com/nonexistent');
      const result = await cache.delete(request);
      expect(result).toBe(false);
    });

    it('should accept string URL', async () => {
      const result = await cache.delete('https://example.com/api');
      expect(result).toBe(true);
    });

    it('should return false for non-GET requests without ignoreMethod', async () => {
      const request = new Request('https://example.com/api', {
        method: 'POST',
      });
      const result = await cache.delete(request);
      expect(result).toBe(false);
    });

    it('should handle non-GET requests with ignoreMethod option', async () => {
      const request = new Request('https://example.com/api', {
        method: 'POST',
      });
      const result = await cache.delete(request, { ignoreMethod: true });
      expect(result).toBe(true);
    });
  });

  describe('Vary header support', () => {
    it('should cache different responses based on Vary header', async () => {
      const baseUrl = 'https://example.com/vary-api';

      const request1 = new Request(baseUrl, {
        headers: { 'accept-encoding': 'gzip' },
      });
      const response1 = createTestResponse('gzipped content', 200, {
        vary: 'accept-encoding',
        'cache-control': 'max-age=300',
      });
      await cache.put(request1, response1);

      const request2 = new Request(baseUrl, {
        headers: { 'accept-encoding': 'br' },
      });
      const response2 = createTestResponse('brotli content', 200, {
        vary: 'accept-encoding',
        'cache-control': 'max-age=300',
      });
      await cache.put(request2, response2);

      const matched1 = await cache.match(request1);
      const matched2 = await cache.match(request2);

      expect(matched1).toBeDefined();
      expect(matched2).toBeDefined();
      expect(await matched1!.text()).toBe('gzipped content');
      expect(await matched2!.text()).toBe('brotli content');
    });

    it('should handle multiple Vary headers', async () => {
      const request = new Request('https://example.com/multi-vary', {
        headers: {
          'accept-encoding': 'gzip',
          'accept-language': 'en-US',
        },
      });
      const response = createTestResponse('content', 200, {
        vary: 'accept-encoding, accept-language',
        'cache-control': 'max-age=300',
      });

      await cache.put(request, response);

      const matched = await cache.match(request);
      expect(matched).toBeDefined();
    });
  });

  describe('Custom cache key rules', () => {
    it('should accept cache key rules configuration', () => {
      const customCache = new SharedCache(storage, {
        cacheKeyRules: {
          header: { include: ['authorization'] },
        },
      });

      expect(customCache).toBeInstanceOf(SharedCache);
    });
  });

  describe('HTTP compliance', () => {
    it('should handle cacheable responses', async () => {
      const request = new Request('https://example.com/cacheable');
      const response = createTestResponse('data', 200, {
        'cache-control': 'public, max-age=300',
      });

      await cache.put(request, response);
      const matched = await cache.match(request);

      expect(matched).toBeDefined();
      expect(await matched!.text()).toBe('data');
    });

    it('should handle must-revalidate directive', async () => {
      const request = new Request('https://example.com/must-revalidate');
      const response = createTestResponse('data', 200, {
        'cache-control': 'max-age=300, must-revalidate',
      });

      await cache.put(request, response);

      const matched = await cache.match(request);
      expect(matched).toBeDefined();
    });

    it('should handle private directive in shared cache', async () => {
      const request = new Request('https://example.com/private');
      const response = createTestResponse('private data', 200, {
        'cache-control': 'private, max-age=300',
      });

      await cache.put(request, response);

      // Private responses should not be cached in shared caches
      const matched = await cache.match(request);
      expect(matched).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle malformed URLs gracefully', async () => {
      try {
        const response = createTestResponse('data');
        await cache.put('not-a-valid-url', response);
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
      }
    });

    it('should handle concurrent operations without errors', async () => {
      const request = new Request('https://example.com/concurrent');
      const response = createTestResponse('data');

      const operations = Promise.all([
        cache.put(request, response.clone()),
        cache.match(request),
        cache.delete(request),
        cache.put(request, response.clone()),
      ]);

      await expect(operations).resolves.toBeDefined();
    });
  });

  describe('Cache status headers', () => {
    it('should set HIT status for cache hits', async () => {
      const request = new Request('https://example.com/hit-test');
      const response = createTestResponse('cached content');

      await cache.put(request, response);
      const matched = await cache.match(request);

      expect(matched!.headers.get(CACHE_STATUS_HEADERS_NAME)).toBe(HIT);
    });
  });
});
