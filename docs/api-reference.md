# API Reference

[← Back to README](../README.md) · [Documentation index](./README.md)

## Core API Overview

**Main functions:**

- **`createFetch(cache?, options?)`** - Cached fetch for outbound HTTP requests
- **`createCacheHandler(cache, defaults?)`** - Cached resolver for in-process origin handlers
- **`resolveWithCache(cache, request, origin, options?)`** - Low-level cache resolution (used by both APIs above)
- **`createLogger(logger?, logLevel?, prefix?)`** - Create logger with level filtering

**Classes:**

- **`Cache`** - Main cache implementation
- **`CacheStorage`** - Cache storage manager

**Key types:**

- **`KVStorage`** - Storage backend interface
- **`SharedCacheRequestInitProperties`** - Request cache configuration
- **`CacheKeyRules`** - Cache key generation rules

---

## createFetch Function

Creates a fetch function with shared cache configuration.

```typescript
function createFetch(
  cache?: Cache,
  options?: {
    fetch?: typeof fetch;
    defaults?: Partial<SharedCacheRequestInitProperties>;
  }
): SharedCacheFetch;
```

**Parameters:**

- **`cache`** - Optional SharedCache instance (auto-discovered from globalThis.caches if not provided)
- **`options.fetch`** - Custom fetch implementation to use as the underlying fetcher (defaults to globalThis.fetch)
- **`options.defaults`** - Default shared cache options to apply to all requests

**Returns:** `SharedCacheFetch` - A fetch function with caching capabilities

**Basic usage:**

```typescript
const cache = await caches.open('my-cache');
const fetch = createFetch(cache, {
  defaults: { cacheControlOverride: 's-maxage=300' },
});
```

## createCacheHandler / resolveWithCache

For in-process origins (e.g. middleware `next()`). Same cache options as `createFetch`. On cache miss, origin throws propagate; during revalidation, throws become 5xx for `stale-if-error`.

```typescript
const handler = createCacheHandler(cache, {
  cacheControlOverride: 's-maxage=60',
});
await handler.resolve(request, () => next(), { waitUntil });
```

Use `createFetch` for outbound HTTP; use `createCacheHandler` for in-process handlers.

## Key Interfaces

### SharedCacheRequestInitProperties

Request-level cache configuration:

```typescript
interface SharedCacheRequestInitProperties {
  cacheControlOverride?: string;
  cacheKeyRules?: CacheKeyRules;
  ignoreRequestCacheControl?: boolean;
  ignoreVary?: boolean;
  varyOverride?: string;
  event?: ExtendableEvent;
}
```

### CacheKeyRules

Cache key generation rules:

```typescript
interface CacheKeyRules {
  cookie?: KeyFilterOptions | boolean;
  device?: KeyFilterOptions | boolean;
  header?: KeyFilterOptions | boolean;
  search?: KeyFilterOptions | boolean;
}
```

### KVStorage

Storage backend interface:

```typescript
interface KVStorage {
  get: (cacheKey: string) => Promise<unknown | undefined>;
  set: (cacheKey: string, value: unknown, ttl?: number) => Promise<void>;
  delete: (cacheKey: string) => Promise<boolean>;
}
```

## Classes

### Cache / CacheStorage

```typescript
class Cache {
  match(request: RequestInfo | URL): Promise<Response | undefined>;
  put(request: RequestInfo | URL, response: Response): Promise<void>;
  delete(request: RequestInfo | URL): Promise<boolean>;
}

class CacheStorage {
  constructor(storage: KVStorage);
  open(cacheName: string): Promise<Cache>;
}
```

## Utilities

### `createLogger(logger?, logLevel?, prefix?)`

```typescript
const logger = createLogger(console, LogLevel.INFO, 'MyApp');
```

Creates a structured logger with level filtering and optional prefix.

### Cache Status Values

```typescript
type CacheStatus =
  | 'HIT'
  | 'MISS'
  | 'EXPIRED'
  | 'UPDATING'
  | 'STALE'
  | 'BYPASS'
  | 'REVALIDATED'
  | 'DYNAMIC';
```

Status values are automatically added to response headers as `x-cache-status`.

**Complete API documentation** is also available in TypeScript definitions and source code.
