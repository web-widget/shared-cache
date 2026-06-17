import {
  BYPASS,
  CACHE_KEY_HEADER_NAME,
  CACHE_STATUS_HEADER_NAME,
  Cache,
  CacheStorage,
  CANNOT_INCLUDE_HEADERS,
  createCacheKeyGenerator,
  createFetch,
  DEFAULT_CACHE_KEY_RULES,
  HIT,
  SHARED_CACHE_STATUS,
} from './index';

describe('package entry', () => {
  it('should re-export the public API', () => {
    expect(Cache).toBeDefined();
    expect(CacheStorage).toBeDefined();
    expect(createFetch).toEqual(expect.any(Function));
    expect(createCacheKeyGenerator).toEqual(expect.any(Function));
    expect(DEFAULT_CACHE_KEY_RULES.scheme).toBe(true);
    expect(CANNOT_INCLUDE_HEADERS).toContain('cookie');
    expect(HIT).toBe(SHARED_CACHE_STATUS.HIT);
    expect(BYPASS).toBe(SHARED_CACHE_STATUS.BYPASS);
    expect(CACHE_STATUS_HEADER_NAME).toBe('x-cache-status');
    expect(CACHE_KEY_HEADER_NAME).toBe('x-cache-key');
  });
});
