# SharedCache

[![CI](https://github.com/web-widget/shared-cache/actions/workflows/test.yml/badge.svg?event=push)](https://github.com/web-widget/shared-cache/actions/workflows/test.yml?query=event%3Apush)
[![npm version](https://badge.fury.io/js/@web-widget%2Fshared-cache.svg)](https://badge.fury.io/js/@web-widget%2Fshared-cache)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

**A standards-compliant HTTP cache implementation for server-side applications.**

SharedCache is a sophisticated HTTP caching library that follows Web Standards and HTTP specifications. It implements a cache interface similar to the [Web Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) but optimized for server-side shared caching scenarios.

The library intelligently determines when HTTP responses can be reused from cache, strictly adhering to [RFC 7234](http://httpwg.org/specs/rfc7234.html) caching rules for both user agents and shared caches.

## 📋 Table of Contents

- [✨ Key Features](#-key-features)
- [🤔 Why SharedCache?](#-why-sharedcache)
- [📦 Installation](#-installation)
- [🚀 Quick Start](#-quick-start)
- [🌐 Global Setup](#-global-setup)
- [🎛️ Advanced Usage](#️-advanced-usage)
- [📚 API Reference](#-api-reference)
- [💡 Examples](#-examples)
- [🏗️ Production Deployment](#️-production-deployment)
- [🤝 Who's Using SharedCache](#-whos-using-sharedcache)
- [🙏 Acknowledgments](#-acknowledgments)
- [📄 License](#-license)

## ✨ Key Features

- **📋 RFC Compliance**: Full implementation of [RFC 5861](https://tools.ietf.org/html/rfc5861) with support for `stale-if-error` and `stale-while-revalidate` directives
- **🎯 Smart Caching**: Intelligently handles complex HTTP caching scenarios including `Vary` headers, proxy revalidation, and authenticated responses  
- **🔧 Flexible Storage**: Pluggable storage backend supporting memory, Redis, or any custom key-value store
- **🚀 Enhanced Fetch**: Extends the standard `fetch` API with powerful caching capabilities while maintaining full compatibility
- **🎛️ Custom Cache Keys**: Advanced cache key customization supporting device types, cookies, headers, and URL components
- **⚡ Shared Cache Optimization**: Prioritizes `s-maxage` over `max-age` for optimal shared cache performance
- **🌍 Universal Runtime**: Compatible with [WinterCG](https://wintercg.org/) environments including Node.js, Deno, Bun, and Edge Runtime

## 🤔 Why SharedCache?

While the Web `fetch` API has become ubiquitous in server-side JavaScript, there's been a lack of standardized caching solutions for server environments. Existing browser Cache APIs are designed for single-user scenarios, but server-side applications need **shared caches** that serve multiple users efficiently.

SharedCache bridges this gap by providing:

- **Server-Optimized Caching**: Designed specifically for multi-user server environments
- **Standards Compliance**: Follows HTTP specifications while handling server-specific edge cases
- **Production Ready**: Battle-tested patterns from CDN and proxy server implementations

## 📦 Installation

```bash
npm install @web-widget/shared-cache
```

```bash
# Using yarn
yarn add @web-widget/shared-cache

# Using pnpm  
pnpm add @web-widget/shared-cache
```

## 🚀 Quick Start

Here's a simple example to get you started with SharedCache:

```typescript
import {
  CacheStorage,
  createSharedCacheFetch,
  type KVStorage,
} from '@web-widget/shared-cache';
import { LRUCache } from 'lru-cache';

// Create a storage backend using LRU cache
const createLRUCache = (): KVStorage => {
  const store = new LRUCache<string, any>({ max: 1024 });

  return {
    async get(cacheKey: string) {
      return store.get(cacheKey);
    },
    async set(cacheKey: string, value: any, ttl?: number) {
      store.set(cacheKey, value, { ttl });
    },
    async delete(cacheKey: string) {
      return store.delete(cacheKey);
    },
  };
};

// Initialize cache storage and create cached fetch
const caches = new CacheStorage(createLRUCache());

async function example() {
  const cache = await caches.open('api-cache-v1');
  const fetch = createSharedCacheFetch(cache);
  
  // First request - will hit the network
  console.time('First request');
  const response1 = await fetch(
    'https://httpbin.org/response-headers?cache-control=max-age%3D604800'
  );
  console.timeEnd('First request'); // ~400ms
  
  // Second request - served from cache
  console.time('Cached request');
  const response2 = await fetch(
    'https://httpbin.org/response-headers?cache-control=max-age%3D604800'
  );
  console.timeEnd('Cached request'); // ~2ms
  
  // Check cache status
  console.log('Cache status:', response2.headers.get('x-cache-status')); // "HIT"
}

example();
```

## 🌐 Global Setup

### Setting up Global Cache Storage

For applications that need a global cache instance, you can set up the `caches` object:

```typescript
import { CacheStorage, type KVStorage } from '@web-widget/shared-cache';
import { LRUCache } from 'lru-cache';

// Extend global types for TypeScript support
declare global {
  interface WindowOrWorkerGlobalScope {
    caches: CacheStorage;
  }
}

const createLRUCache = (): KVStorage => {
  const store = new LRUCache<string, any>({ 
    max: 1024,
    ttl: 1000 * 60 * 60 // 1 hour default TTL
  });

  return {
    async get(cacheKey: string) {
      return store.get(cacheKey);
    },
    async set(cacheKey: string, value: any, ttl?: number) {
      store.set(cacheKey, value, { ttl });
    },
    async delete(cacheKey: string) {
      return store.delete(cacheKey);
    },
  };
};

// Set up global cache storage
const caches = new CacheStorage(createLRUCache());
globalThis.caches = caches;
```

### Setting up Global Fetch

Once the global `caches` is configured, you can also register a globally cached `fetch`:

```typescript
import { createGlobalFetch, type Fetch } from '@web-widget/shared-cache';

declare global {
  interface WindowOrWorkerGlobalScope {
    fetch: Fetch;
  }
}

// Replace global fetch with cached version
globalThis.fetch = createGlobalFetch();
```

## 🎛️ Advanced Usage

### Enhanced Fetch API

SharedCache extends the standard fetch API with powerful caching options via the `sharedCache` parameter:

```typescript
const response = await fetch('https://api.example.com/data', {
  // Standard fetch options
  method: 'GET',
  headers: {
    'Authorization': 'Bearer token',
  },
  
  // SharedCache-specific options
  sharedCache: {
    cacheControlOverride: 's-maxage=120',
    varyOverride: 'accept-language',
    ignoreRequestCacheControl: true,
    ignoreVary: false,
    cacheKeyRules: {
      host: true,
      pathname: true,
      search: false,
      device: true,
      header: {
        include: ['authorization']
      }
    },
  },
});
```

### SharedCache Options

#### `cacheControlOverride`

Override or extend cache control directives when APIs don't provide optimal caching headers:

```typescript
// Add shared cache directive
sharedCache: {
  cacheControlOverride: 's-maxage=3600'
}

// Combine multiple directives  
sharedCache: {
  cacheControlOverride: 's-maxage=3600, must-revalidate'
}
```

#### `varyOverride`

Add additional Vary headers to ensure proper cache segmentation:

```typescript
sharedCache: {
  varyOverride: 'accept-language, user-agent'
}
```

#### `ignoreRequestCacheControl`

Control whether to honor cache-control directives from the request:

```typescript
// Ignore client cache-control headers (default: true)
sharedCache: {
  ignoreRequestCacheControl: false
}
```

#### `ignoreVary`

Disable Vary header processing for simplified caching:

```typescript
sharedCache: {
  ignoreVary: true // Cache regardless of Vary headers
}
```

#### `cacheKeyRules`

Customize how cache keys are generated to optimize cache hit rates and handle different caching scenarios:

```typescript
sharedCache: {
  cacheKeyRules: {
    // URL components
    host: true,           // Include hostname  
    pathname: true,       // Include URL path
    search: true,         // Include query parameters (default)
    
    // Request context
    device: false,        // Classify by device type
    cookie: {             // Include specific cookies
      include: ['session_id', 'user_pref']
    },
    header: {             // Include specific headers
      include: ['authorization', 'x-api-key'],
      checkPresence: ['x-mobile-app']
    }
  }
}
```

**Default cache key rules:**

```typescript
{
  host: true,
  pathname: true,
  search: true,
}
```

### Cache Key Components

#### **URL Components**

- **`host`**: Include the hostname in the cache key
- **`pathname`**: Include the URL path
- **`search`**: Control query parameter inclusion

**Query Parameter Control:**

```typescript
// Include all query parameters (default)
search: true

// Exclude all query parameters  
search: false

// Include specific parameters
search: {
  include: ['category', 'page']
}

// Include all except specific parameters
search: {
  exclude: ['timestamp', 'nonce']
}
```

#### **Device Classification**

Automatically classify requests as `mobile`, `desktop`, or `tablet` based on User-Agent:

```typescript
cacheKeyRules: {
  device: true  // Separate cache for different device types
}
```

#### **Cookie-Based Caching**

Include specific cookies in the cache key:

```typescript
cacheKeyRules: {
  cookie: {
    include: ['user_id', 'session_token'],
    checkPresence: ['is_premium']  // Check existence without value
  }
}
```

#### **Header-Based Caching**

Include request headers in the cache key:

```typescript
cacheKeyRules: {
  header: {
    include: ['authorization', 'x-api-version'],
    checkPresence: ['x-feature-flag']
  }
}
```

**Restricted Headers:** For security and performance, certain headers cannot be included:

- High-cardinality headers: `accept`, `accept-charset`, `accept-encoding`, `accept-language`, `user-agent`, `referer`
- Cache/proxy headers: `cache-control`, `if-*`, `range`, `connection`
- Headers handled by other features: `cookie`, `host`

## 📚 API Reference

### CacheStorage Class

Implements a subset of the [Web CacheStorage API](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage), optimized for server-side caching.

#### Constructor

```typescript
new CacheStorage(storage: KVStorage)
```

**Parameters:**

- `storage` - Custom storage backend implementing the `KVStorage` interface

#### Methods

##### `open(cacheName: string): Promise<Cache>`

Opens or creates a named cache instance.

```typescript
const cache = await caches.open('api-cache-v1');
```

**Note:** Unlike the Web API, other CacheStorage methods (`delete`, `match`, `has`, `keys`) are not implemented.

### Cache Class  

Implements a subset of the [Web Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) with server-side optimizations.

#### `match(request, options?): Promise<Response | undefined>`

Retrieves a cached response or fetches and caches a new one.

**Parameters:**

- `request` - The Request object or URL string
- `options` - Optional cache query options

**Returns:** Cached Response if available and fresh, undefined otherwise

```typescript
const cachedResponse = await cache.match('https://api.example.com/data');
```

#### `put(request, response): Promise<void>`

Stores a request/response pair in the cache.

**Parameters:**

- `request` - The Request object or URL string  
- `response` - The Response to cache

**Note:** Only cacheable responses are stored (based on HTTP caching rules).

```typescript
await cache.put(request, response);
```

#### `delete(request, options?): Promise<boolean>`

Removes a cached entry.

**Parameters:**

- `request` - The Request object or URL string
- `options` - Optional cache query options

**Returns:** `true` if entry was deleted, `false` if not found

```typescript
const deleted = await cache.delete('https://api.example.com/data');
```

### CacheQueryOptions

Extended options for cache operations:

```typescript
interface CacheQueryOptions {
  ignoreMethod?: boolean;  // Treat request as GET regardless of actual method
}
```

#### `ignoreMethod`

When `true`, the request is treated as a GET request for cache operations, regardless of its actual HTTP method.

## 💡 Examples

### Redis Storage Backend

```typescript
import Redis from 'ioredis';
import { CacheStorage, type KVStorage } from '@web-widget/shared-cache';

const createRedisStorage = (): KVStorage => {
  const redis = new Redis(process.env.REDIS_URL);
  
  return {
    async get(key: string) {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : undefined;
    },
    
    async set(key: string, value: any, ttl?: number) {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await redis.setex(key, Math.ceil(ttl / 1000), serialized);
      } else {
        await redis.set(key, serialized);
      }
    },
    
    async delete(key: string) {
      return (await redis.del(key)) > 0;
    },
  };
};

const caches = new CacheStorage(createRedisStorage());
```

### API Response Caching

```typescript
import { createSharedCacheFetch } from '@web-widget/shared-cache';

const cache = await caches.open('api-responses');
const fetch = createSharedCacheFetch(cache);

// Cache API responses with custom rules
async function fetchUserData(userId: string) {
  return fetch(`https://api.example.com/users/${userId}`, {
    sharedCache: {
      cacheControlOverride: 's-maxage=300', // Cache for 5 minutes
      cacheKeyRules: {
        header: {
          include: ['authorization'] // Separate cache per user
        }
      }
    }
  });
}
```

### Device-Specific Caching

```typescript
// Different cache entries for mobile vs desktop
const response = await fetch('https://api.example.com/content', {
  sharedCache: {
    cacheKeyRules: {
      device: true, // Separate cache for mobile/desktop/tablet
      search: {
        exclude: ['timestamp'] // Ignore timestamp in cache key
      }
    }
  }
});
```

## 🏗️ Production Deployment

### Memory Management

```typescript
import { LRUCache } from 'lru-cache';

const createProductionCache = (): KVStorage => {
  const store = new LRUCache<string, any>({
    max: 10000,                    // Maximum 10k entries
    ttl: 1000 * 60 * 60 * 24,    // 24 hour default TTL
    updateAgeOnGet: true,          // Refresh TTL on access
    allowStale: true,             // Serve stale during updates
  });
  
  return {
    async get(key: string) {
      return store.get(key);
    },
    async set(key: string, value: any, ttl?: number) {
      store.set(key, value, { ttl: ttl || undefined });
    },
    async delete(key: string) {
      return store.delete(key);
    },
  };
};
```

### Monitoring Cache Performance

```typescript
const cache = await caches.open('monitored-cache');
const fetch = createSharedCacheFetch(cache);

// Wrap fetch to add monitoring
const monitoredFetch = async (url: string, options: any) => {
  const start = Date.now();
  const response = await fetch(url, options);
  const duration = Date.now() - start;
  const cacheStatus = response.headers.get('x-cache-status');
  
  console.log(`${cacheStatus}: ${url} (${duration}ms)`);
  
  return response;
};
```

## 🤝 Who's Using SharedCache

- [Web Widget: Cache middleware](https://github.com/web-widget/web-widget/blob/main/packages/middlewares/src/cache.ts)

## 🙏 Acknowledgments

SharedCache draws inspiration from industry-leading caching implementations:

- [Cloudflare Cache Key](https://developers.cloudflare.com/cache/how-to/cache-keys/) - Cache key customization patterns
- [Next.js Data Cache](https://nextjs.org/docs/app/building-your-application/caching#data-cache) - Server-side caching strategies  
- [nodejs/undici](https://github.com/nodejs/undici/blob/main/lib/web/cache/cache.js) - Web Standards implementation
- [http-cache-lru](https://github.com/o-development/http-cache-lru/) - HTTP cache semantics
- [Cloudflare Miniflare](https://github.com/cloudflare/miniflare/blob/master/packages/cache/src/cache.ts) - Edge runtime patterns
- [Cloudflare Workers SDK](https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/src/workers/cache/cache.worker.ts) - Worker environment optimizations
- [ultrafetch](https://github.com/natemoo-re/ultrafetch) - Fetch API extensions
- [island.is Cache Middleware](https://github.com/island-is/island.is/blob/main/libs/clients/middlewares/src/lib/withCache/withCache.ts) - Production caching patterns
- [make-fetch-happen](https://github.com/npm/make-fetch-happen) - HTTP caching with retry and offline support

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.
