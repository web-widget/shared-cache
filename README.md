# SharedCache

[![CI](https://github.com/web-widget/shared-cache/actions/workflows/test.yml/badge.svg?event=push)](https://github.com/web-widget/shared-cache/actions/workflows/test.yml?query=event%3Apush)

An http cache following http header semantics. It implements the [Cache Interface](https://developer.mozilla.org/en-US/docs/Web/API/Cache), but different.

`SharedCache` tells when responses can be reused from a cache, taking into account [HTTP RFC 7234](http://httpwg.org/specs/rfc7234.html) rules for user agents and shared caches.

## Features

- Implements [RFC 5861](https://tools.ietf.org/html/rfc5861), implements "stale-if-error" and "stale-while-revalidate"
- It's aware of many tricky details such as the `vary` header, proxy revalidation, and authenticated responses
- Supports inserting external storage, such as using memory or Redis database
- It extends the caching capabilities of the `fetch` function
- Support custom Cache Key, for example, you can cache specific members of device types, cookies and headers
- For HTTP's `cache-control` header, `SharedCache` prefers `s-maxage`

The project works in a [WinterCG](https://wintercg.org/) compatible runtime environment.

## Why `SharedCache`

Although the use of the Web `fetch` API has become very common on the server side, there is still a lack of standardized caching API on the server side. The Web `Cache` API was a priority, but we needed to carefully handle server-side scenarios and browser differences, so that was the motivation for creating this project.

Since a browser's cache is typically targeted to a single user, while a server's cache typically serves all users, this is why the project is called `SharedCache`.

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

## Create global `caches` and `fetch`

The global `caches` object needs to be defined beforehand. The `caches` object is a global instance of the `CacheStorage` class.

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
import { fetch, type Fetch } from '@web-widget/shared-cache';

declare global {
  interface WindowOrWorkerGlobalScope {
    fetch: Fetch;
  }
}

globalThis.fetch = fetch;
```

## `fetch` function

The `SharedCache` project creates a `fetch` function that conforms to the definition of the Web [fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), but extends it.

```ts
const res = await fetch('https://httpbin.org/response-headers', {
  sharedCache: {
    cacheControlOverride: 's-maxage=120',
    varyOverride: 'accept-language',
    cacheKeyRules: {
      host: true,
      pathname: true,
      search: false,
      device: true,
    },
  },
});
```

### `sharedCache` options

#### `cacheControlOverride`

Since many APIs do not configure cache headers correctly, you can use override cache control values.

#### `varyOverride`

You can use override vary values.

#### `cacheKeyRules`

Custom cache key. See also [`CacheQueryOptions`](#cachequeryoptions).

## `CacheStorage` class

The `CacheStorage` class implements [CacheStorage](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage) interface, but does not implement its specification. It deviates from it in a few ways.

### `constructor`

```ts
new CacheStorage(storage);
```

#### Parameters

- `storage` Custom external storage

### `open`

Returns a Promise that resolves to the Cache object matching the cacheName (a new cache is created if it doesn't already exist.) This method follows the specification.

### ~~`delete`~~

`SharedCache` didn't implement it.

### ~~`match`~~

`SharedCache` didn't implement it.

### ~~`has`~~

`SharedCache` didn't implement it.

### ~~`keys`~~

`SharedCache` didn't implement it.

## `Cache` class

The `Cache` class implements [Cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache) interface, but does not implement its specification. It deviates from it in a few ways.

### `match(request, options)`

Checks the cache to see if it includes the response to the given request. If it does and the response isn't stale, it returns the response. Otherwise, it will make a fetch, cache the response, and return the response.

#### Parameters

- `request` The Request for which you are attempting to find responses in the Cache. See also [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request)
- `options` An object that sets options for the match operation. See also [`CacheQueryOptions`](#cachequeryoptions)

### `put(request, response, options)`

Takes both a request and its response and adds it to the given cache if allowed. This method deviates from the specification in a few ways:

It has extra protections beyond the specification. For example, a response that includes the `cahce-control: no-cache` will not be stored in this library, but would be stored in a specification compliant library.

#### Parameters

- `request` The Request object or URL that you want to add to the cache. See also [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request)
- `response` The Response you want to match up to the request. See also [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)
- `options` An object that sets options for the put operation. See also [`CacheQueryOptions`](#cachequeryoptions)

### `delete(request, options)`

Finds the Cache entry whose key is the request, returning a Promise that resolves to true if a matching Cache entry is found and deleted. If no Cache entry is found, the promise resolves to false. This method follows the specification.

#### Parameters

- `request` The Request you are looking to delete. See also [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request)
- `options` An object whose properties control how matching is done in the delete operation. See also [`CacheQueryOptions`](#cachequeryoptions)

### ~~`add`~~

`SharedCache` didn't implement it.

### ~~`addAll`~~

`SharedCache` didn't implement it.

### ~~`keys`~~

`SharedCache` didn't implement it.

## `CacheQueryOptions`

This is an option for query caching which extends the specification.

### `cacheKeyRules`

Custom cache key generation rules.

Default value:

```ts
{
  host: true,
  pathname: true,
  search: true,
}
```

List of built-in supported parts:

- `host`
- `pathname`
- `search`
- `cookie`
- `device`
- `header`

#### Search

The query string controls which URL query string parameters go into the Cache Key. You can `include` specific query string parameters or `exclude` them using the respective fields. When you include a query string parameter, the `value` of the query string parameter is used in the Cache Key.

##### Example

If you include the query string foo in a URL like `https://www.example.com/?foo=bar`, then bar appears in the Cache Key. Exactly one of `include` or `exclude` is expected.

```ts
{
  search: {
    include: ['foo'],
  },
}
```

##### Usage notes

- To include all query string parameters (the default behavior), use `search: true`
- To ignore query strings, use `search: false`
- To include most query string parameters but exclude a few, use the exclude field which assumes the other query string parameters are included.

#### Headers

Headers control which headers go into the Cache Key. Similar to Query String, you can include specific headers or exclude default headers.

When you include a header, the header value is included in the Cache Key. For example, if an HTTP request contains an HTTP header like `X-Auth-API-key: 12345`, and you include the `X-Auth-API-Key header` in your Cache Key Template, then `12345` appears in the Cache Key.

To check for the presence of a header without including its actual value, use the `checkPresence` option.

Currently, you can only exclude the `Origin` header. The `Origin` header is always included unless explicitly excluded. Including the [Origin header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin) in the Cache Key is important to enforce [CORS](https://developer.mozilla.org/en-US/docs/Glossary/CORS). Additionally, you cannot include the following headers:

- Headers that have high cardinality and risk sharding the cache
  - `accept`
  - `accept-charset`
  - `accept-encoding`
  - `accept-datetime`
  - `accept-language`
  - `referer`
  - `user-agent`
- Headers that re-implement cache or proxy features
  - `connection`
  - `content-length`
  - `cache-control`
  - `if-match`
  - `if-modified-since`
  - `if-none-match`
  - `if-unmodified-since`
  - `range`
  - `upgrade`
- Headers that are covered by other Cache Key features
  - `cookie`
  - `host`
- Headers that cache status
  - `x-cache-status`

#### Host

Host determines which host header to include in the Cache Key.

#### Cookie

Like `search` or `header`, `cookie` controls which cookies appear in the Cache Key. You can either include the cookie value or check for the presence of a particular cookie.

#### Device

Classifies a request as `mobile`, `desktop`, or `tablet` based on the User Agent.

### ~~`ignoreMethod`~~

`SharedCache` didn't implement it.

### ~~`ignoreSearch`~~

`SharedCache` didn't implement it.

### ~~`ignoreVary`~~

`SharedCache` didn't implement it.

## Thanks

The birth of `SharedCache` is inseparable from the inspiration of the following projects:

- [Cloudflare Cache Key](https://developers.cloudflare.com/cache/how-to/cache-keys/)
- [Next Data Cache](https://nextjs.org/docs/app/building-your-application/caching#data-cache)
- [nodejs/undici](https://github.com/nodejs/undici/blob/main/lib/web/cache/cache.js)
- [o-development/http-cache-lru](https://github.com/o-development/http-cache-lru/)
- [cloudflare/miniflare](https://github.com/cloudflare/miniflare/blob/master/packages/cache/src/cache.ts)
- [cloudflare/workers-sdk](https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/src/workers/cache/cache.worker.ts)
- [natemoo-re/ultrafetch](https://github.com/natemoo-re/ultrafetch)
- [island.is/island.is](https://github.com/island-is/island.is/blob/main/libs/clients/middlewares/src/lib/withCache/withCache.ts)
