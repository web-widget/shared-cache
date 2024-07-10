# @web-widget/shared-cache

## 1.0.0-next.2

### Patch Changes

- b3761de: Fix Request.cache equal to "default" will cause exception.

## 1.0.0-next.1

### Patch Changes

- 98bdedb: - The stale-while-revalidate and stale-if-error directives are not supported when using the cache.put or cache.match methods.
  - Support HEAD requests.

## 1.0.0-next.0

### Major Changes

- 8682fd6: - Support ignoreMethod option.
  - support ignoreRequestCacheContro option.
  - Ignore spaces in cache keys.

## 0.4.2

### Patch Changes

- 6596e83: Reduce the frequency of cache revalidation.

## 0.4.1

### Patch Changes

- cbe32be: Optimize the order of logs and vary in cache keys.

## 0.4.0

### Minor Changes

- 6603ef3: Support custom logger.

## 0.3.0

### Minor Changes

- be3d4d6: cacheName will be added to the prefix of cache key.

## 0.2.3

### Patch Changes

- bec7c90: Avoid strict instance checks leading to run failures.

## 0.2.2

### Patch Changes

- 453e7ee: Improve error handling.

## 0.2.1

### Patch Changes

- 1c7d03c: Fix `Cache.put: Response body is locked or disturbed` error.

## 0.2.0

### Minor Changes

- dc275c7: Make the post method’s caching logic comply with standards.

## 0.1.2

### Patch Changes

- 98a3a1a: Fixed the problem of failing to process logs correctly after updating the cache error.

## 0.1.1

### Patch Changes

- d1aa8b2: Fix `cacheControlOverride` not being overridden correctly.

## 0.1.0

### Minor Changes

- c7f91c9: Delete `CacheStorage.delete()` API.

## 0.0.2

### Patch Changes

- c3db08e: Refactor types.

## 0.0.1

### Patch Changes

- fbffa04: Initial version.
