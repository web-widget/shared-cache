# shared-cache

An http cache following http header semantics. It implements the [Cache Interface](https://developer.mozilla.org/en-US/docs/Web/API/Cache), but it DOES NOT follow the Cache Interface specification.

## Installation

```
npm i @web-widget/shared-cache
```

## Usage

```ts
import {
  CacheStorage,
  createFetch,
  type KVStorage,
} from '@web-widget/shared-cache';
import { LRUCache } from 'lru-cache';

// Optionally provide a settings for the LRU cache. Options are defined here:
// https://www.npmjs.com/package/lru-cache
const createLRUCache = (): KVStorage => {
  const store = new LRUCache<string, any>({ max: 1024 });

  return {
    async get(cacheKey: string) {
      return store.get(cacheKey) as any | undefined;
    },
    async set(cacheKey: string, value: any, ttl?: number) {
      store.set(cacheKey, value, { ttl });
    },
    async delete(cacheKey: string) {
      return store.delete(cacheKey);
    },
  };
};

const caches = new CacheStorage(createLRUCache());

async function run() {
  const cache = await caches.open('v1');
  const fetch = createFetch(cache);
  // Make a request
  // Logs "response1: 425.793ms"
  console.time('response1');
  const response1 = await fetch(
    'https://httpbin.org/response-headers?cache-control=max-age%3D604800'
  );
  console.timeEnd('response1');
  // Make a request to the same location
  // Logs "response2: 1.74ms" because the response was cached
  console.time('response2');
  const response2 = await fetch(
    'https://httpbin.org/response-headers?cache-control=max-age%3D604800'
  );
  console.timeEnd('response2');
}
run();
```

## `cahces` object

The global `cahces` object needs to be defined beforehand. The `cahces` object is a global instance of the `CacheStorage` class.

```ts
import { CacheStorage, type KVStorage } from '@web-widget/shared-cache';
import { LRUCache } from 'lru-cache';

declare global {
  interface WindowOrWorkerGlobalScope {
    caches: CacheStorage;
  }
}

const createLRUCache = (): KVStorage => {
  const store = new LRUCache<string, any>({ max: 1024 });

  return {
    async get(cacheKey: string) {
      return store.get(cacheKey) as any | undefined;
    },
    async set(cacheKey: string, value: any, ttl?: number) {
      store.set(cacheKey, value, { ttl });
    },
    async delete(cacheKey: string) {
      return store.delete(cacheKey);
    },
  };
};

const caches = new CacheStorage(createLRUCache());
globalThis.caches = caches;
```

When the above global `caches` object is ready, you can also register the globally registered cacheable `fetch`:

```ts
import { fetch, type SharedCacheFetch; } from '@web-widget/shared-cache';

declare global {
  interface WindowOrWorkerGlobalScope {
    fetch: SharedCacheFetch;
  }
}

globalThis.fetch = fetch;
```

## `CacheStorage` class

The `CacheStorage` class implements [CacheStorage](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage) interface, but does not implement its specification. It deviates from it in a few ways.

### `CacheStorage.open`

Returns a Promise that resolves to the Cache object matching the cacheName (a new cache is created if it doesn't already exist.) This method follows the specification.

### `CacheStorage.delete`

Finds the Cache object matching the cacheName, and if found, deletes the Cache object and returns a Promise that resolves to true. If no Cache object is found, it resolves to false. This method follows the specification.

### Unrealized

- `CacheStorage.match`
- `CacheStorage.has`
- `CacheStorage.keys`

## `Cache` class

The `Cache` class implements [Cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache) interface, but does not implement its specification. It deviates from it in a few ways.

### `Cache.match(request, options)`

Checks the cache to see if it includes the response to the given request. If it does and the response isn't stale, it returns the response. Otherwise, it will make a fetch, cache the response, and return the response.

This method deviates from the match method defined in the normal cache interface. It is more similar to the `add` method in that it will make a request if the response is not in the cahce.

The `options` parameter is also ignored.

### `Cache.put(request, response, options)`

Takes both a request and its response and adds it to the given cache if allowed. This method deviates from the specification in a few ways:

It has extra protections beyond the specification. For example, a response that includes the `cahce-control: no-cache` will not be stored in this library, but would be stored in a specification compliant library.

Requests with the same uri, but different headers will overwrite eachother.

### `Cache.delete(request, options)`

Finds the Cache entry whose key is the request, returning a Promise that resolves to true if a matching Cache entry is found and deleted. If no Cache entry is found, the promise resolves to false. This method follows the specification.

### Unrealized

- `Cache.add`
- `Cache.addAll`
- `Cache.keys`

## Thinks

The birth of shared-cache is inseparable from the inspiration of the following projects:

- [http-cache-lru](https://github.com/o-development/http-cache-lru/)
- [cloudflare/miniflare](https://github.com/cloudflare/miniflare/blob/master/packages/cache/src/cache.ts)
- [cloudflare/workers-sdk](https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/src/workers/cache/cache.worker.ts)
