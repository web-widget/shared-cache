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
- [📋 Standards Compliance](#-standards-compliance)
- [❓ Frequently Asked Questions](#-frequently-asked-questions)
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
  createFetch,
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

// Initialize cache storage
const caches = new CacheStorage(createLRUCache());

async function example() {
  const cache = await caches.open('api-cache-v1');
  
  // Create fetch with default configuration (recommended approach)
  const fetch = createFetch({
    cache,
    defaultCacheControl: 's-maxage=300', // 5 minutes default caching
  });
  
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

### Legacy API Support

The older `createSharedCacheFetch` API is still supported for backward compatibility but not recommended for new projects:

```typescript
import { createSharedCacheFetch } from '@web-widget/shared-cache';

// Legacy approach - more verbose
const cache = await caches.open('api-cache-v1');
const fetch = createSharedCacheFetch(cache);
```

> **⚠️ Deprecation Notice**: `createSharedCacheFetch` is deprecated. Use `createFetch` for better API design with default configuration support.

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
import { createFetch } from '@web-widget/shared-cache';

// Replace global fetch with cached version using the new API
globalThis.fetch = createFetch({
  defaultCacheControl: 's-maxage=60', // 1 minute default for global fetch
});
```

## 🎛️ Advanced Usage

### Enhanced Fetch API with Default Configuration

The new `createFetch` API allows you to set default cache configuration at creation time, reducing repetition:

```typescript
import { createFetch } from '@web-widget/shared-cache';

const cache = await caches.open('api-cache');

// Create fetch with comprehensive defaults
const fetch = createFetch({
  cache,
  defaultCacheControl: 's-maxage=300',
  defaultCacheKeyRules: {
    header: { include: ['x-api-version'] }
  },
  defaultIgnoreRequestCacheControl: true,
  defaultIgnoreVary: false,
});

// Use with defaults applied automatically
const response1 = await fetch('/api/data');

// Override defaults for specific requests
const response2 = await fetch('/api/data', {
  sharedCache: {
    cacheControlOverride: 's-maxage=600', // Override default
  }
});
```

### Legacy Enhanced Fetch API

SharedCache extends the standard fetch API with powerful caching options via the `sharedCache` parameter:

```typescript
const response = await fetch('https://api.example.com/data', {
  // Standard fetch options
  method: 'GET',
  headers: {
    'x-user-id': '1024',
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
        include: ['x-user-id']
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
      include: ['x-api-key'],
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
    include: ['x-api-version'],
    checkPresence: ['x-feature-flag']
  }
}
```

**Restricted Headers:** For security and performance, certain headers cannot be included:

- **High-cardinality headers**: `accept`, `accept-charset`, `accept-encoding`, `accept-language`, `user-agent`, `referer`
- **Cache/proxy headers**: `cache-control`, `if-*`, `range`, `connection`
- **Authentication headers**: `authorization`, `cookie` (handled separately by cookie rules)
- **Headers handled by other features**: `host`

**⚠️ Important for Shared Caches**: According to HTTP specifications (RFC 7234), responses to requests containing an `Authorization` header must not be stored in shared caches unless explicitly allowed by cache control directives like `public`, `s-maxage`, or `must-revalidate`. This library correctly handles this restriction automatically.

**🔒 Security Note**: SharedCache automatically enforces HTTP caching security rules. Requests containing `Authorization` headers will not be cached unless the response explicitly allows it with directives like `public`, `s-maxage`, or `must-revalidate`.

## 📚 API Reference

### createFetch Function (Recommended)

Creates a fetch function with default shared cache configuration. This is the recommended approach for new projects.

```typescript
function createFetch(options: CreateFetchOptions): SharedCacheFetch
```

**Parameters:**

```typescript
interface CreateFetchOptions {
  cache?: SharedCache;                          // Cache instance
  fetch?: typeof fetch;                         // Custom fetch implementation
  defaultCacheControl?: string;                 // Default cache control directive
  defaultCacheKeyRules?: SharedCacheKeyRules;   // Default cache key rules
  defaultIgnoreRequestCacheControl?: boolean;   // Default: true
  defaultIgnoreVary?: boolean;                  // Default: false
  defaultVaryOverride?: string;                 // Default vary header
  defaultWaitUntil?: (promise: Promise<unknown>) => void; // Background operation handler
}
```

**Example:**

```typescript
const fetch = createFetch({
  cache: await caches.open('my-cache'),
  defaultCacheControl: 's-maxage=300',
  defaultCacheKeyRules: {
    header: { include: ['x-api-version'] }
  }
});
```

### Migration Guide

**From legacy API to `createFetch`:**

```typescript
// Old way (legacy) - deprecated
const fetch = createSharedCacheFetch(cache, {
  defaults: {
    cacheControlOverride: 's-maxage=300',
    ignoreRequestCacheControl: true,
  }
});

// New way (recommended)
const fetch = createFetch({
  cache,
  defaultCacheControl: 's-maxage=300',
  defaultIgnoreRequestCacheControl: true,
});
```

> **Migration Benefits**: The new `createFetch` API provides better type safety, cleaner parameter naming, and more intuitive default configuration.

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

### SharedCache Class  

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

Extended options for cache operations with server-side limitations:

```typescript
interface CacheQueryOptions {
  ignoreMethod?: boolean;  // Treat request as GET regardless of actual method
  // Note: ignoreSearch and ignoreVary are not implemented and will throw errors
}
```

#### `ignoreMethod`

When `true`, the request is treated as a GET request for cache operations, regardless of its actual HTTP method.

**Unsupported Standard Options:**

SharedCache does not implement the following standard Web Cache API options:

- `ignoreSearch` - Query string handling is not customizable
- `ignoreVary` - Vary header processing cannot be bypassed
- `cacheName` - Not applicable in server-side contexts

Attempting to use these options will throw a "Not implemented" error.

## 💡 Examples

### Modern API with Default Configuration

```typescript
import { createFetch, CacheStorage } from '@web-widget/shared-cache';
import { LRUCache } from 'lru-cache';

// Set up cache storage
const caches = new CacheStorage(createLRUCache());
const cache = await caches.open('api-cache-v1');

// Create fetch with comprehensive defaults
const fetch = createFetch({
  cache,
  defaultCacheControl: 's-maxage=300',
  defaultCacheKeyRules: {
    header: { include: ['x-api-version'] },
    search: { exclude: ['timestamp'] }
  },
  defaultIgnoreRequestCacheControl: true,
});

// Simple usage - defaults applied automatically
const userData = await fetch('/api/user/profile');

// Override defaults when needed
const realtimeData = await fetch('/api/realtime', {
  sharedCache: {
    cacheControlOverride: 's-maxage=30', // Shorter cache time
  }
});
```

### Redis Storage Backend

```typescript
import Redis from 'ioredis';
import { CacheStorage, createFetch, type KVStorage } from '@web-widget/shared-cache';

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
const cache = await caches.open('distributed-cache');

// Create fetch with Redis backend
const fetch = createFetch({
  cache,
  defaultCacheControl: 's-maxage=600', // 10 minutes default
  defaultCacheKeyRules: {
    header: { include: ['x-tenant-id'] } // Multi-tenant support
  }
});
```

### API Response Caching with Enhanced Configuration

```typescript
import { createFetch } from '@web-widget/shared-cache';

const cache = await caches.open('api-responses');

// Create API-specific fetch with defaults
const apiFetch = createFetch({
  cache,
  defaultCacheControl: 's-maxage=300', // 5 minutes for API responses
  defaultCacheKeyRules: {
    header: { include: ['x-user-id', 'x-api-version'] },
    search: { exclude: ['_t', 'timestamp'] } // Ignore cache-busting params
  },
  defaultIgnoreRequestCacheControl: true, // Server controls caching
});

// Simple API calls with automatic caching
async function fetchUserData(userId: string) {
  return apiFetch(`/api/users/${userId}`, {
    headers: { 'x-user-id': userId }
  });
}

// Override defaults for specific endpoints
async function fetchRealtimeData() {
  return apiFetch('/api/realtime', {
    sharedCache: {
      cacheControlOverride: 's-maxage=30', // Shorter cache for realtime data
    }
  });
}
```

### Device-Specific Caching

```typescript
// Modern approach with defaults
const deviceAwareFetch = createFetch({
  cache: await caches.open('content-cache'),
  defaultCacheControl: 's-maxage=600',
  defaultCacheKeyRules: {
    device: true, // Separate cache for mobile/desktop/tablet
    search: { exclude: ['timestamp'] }
  }
});

// Simple usage - device detection automatic
const response = await deviceAwareFetch('/api/content');
```

### Shared Cache Security Considerations

```typescript
// ✅ Good: Public API responses can be cached
const publicFetch = createFetch({
  cache: await caches.open('public-api'),
  defaultCacheControl: 's-maxage=300',
});

const publicData = await publicFetch('/api/public/data');

// ✅ Good: Authenticated requests with explicit cache control
const response = await fetch('/api/user/data', {
  headers: {
    'Authorization': 'Bearer token123'
  },
  sharedCache: {
    // Only cache if the response explicitly allows it
    // The library automatically handles authorization header restrictions
  }
});

// ⚠️ Note: Responses to requests with Authorization headers
// are automatically excluded from shared cache unless the response
// includes cache control directives like 'public' or 's-maxage'

// ✅ Good: User-specific cache key for personalized content
const userSpecificFetch = createFetch({
  cache: await caches.open('user-content'),
  defaultCacheKeyRules: {
    header: { include: ['x-user-id'] } // Safe alternative to authorization
  }
});
```

## 🏗️ Production Deployment

### Performance Benefits

SharedCache provides significant performance improvements in production environments:

```typescript
// Before: Without caching
const response = await fetch('/api/data'); // ~400ms every time

// After: With SharedCache
const cachedFetch = createFetch({
  cache: await caches.open('prod-cache'),
  defaultCacheControl: 's-maxage=300',
});
const response = await cachedFetch('/api/data'); // First: ~400ms, Subsequent: ~2ms
```

### Memory Management

```typescript
import { LRUCache } from 'lru-cache';
import { createFetch } from '@web-widget/shared-cache';

const createProductionCache = (): KVStorage => {
  const store = new LRUCache<string, any>({
    max: 10000,                    // Maximum 10k entries
    ttl: 1000 * 60 * 60 * 24,      // 24 hour default TTL
    updateAgeOnGet: true,          // Refresh TTL on access
    allowStale: true,              // Serve stale during updates
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

// Production-ready fetch with optimized caching
const productionFetch = createFetch({
  cache: await new CacheStorage(createProductionCache()).open('prod-cache'),
  defaultCacheControl: 's-maxage=300',
  defaultIgnoreRequestCacheControl: true,
});
```

### Error Handling and Monitoring

```typescript
import { createFetch } from '@web-widget/shared-cache';

const monitoredFetch = createFetch({
  cache: await caches.open('monitored-cache'),
  defaultCacheControl: 's-maxage=300',
  defaultWaitUntil: async (promise) => {
    // Handle background operations (like stale-while-revalidate)
    try {
      await promise;
      console.log('Background cache operation completed');
    } catch (error) {
      console.error('Background cache operation failed:', error);
      // Report to monitoring service
    }
  }
});

// Wrap fetch to add detailed monitoring
const instrumentedFetch = async (url: string, options?: any) => {
  const start = Date.now();
  try {
    const response = await monitoredFetch(url, options);
    const duration = Date.now() - start;
    const cacheStatus = response.headers.get('x-cache-status');
    
    console.log(`${cacheStatus}: ${url} (${duration}ms)`);
    
    // Log cache efficiency metrics
    if (cacheStatus === 'HIT') {
      console.log('✅ Cache hit - served from cache');
    } else if (cacheStatus === 'MISS') {
      console.log('❌ Cache miss - fetched from origin');
    } else if (cacheStatus === 'STALE') {
      console.log('⚡ Stale response served while revalidating');
    }
    
    return response;
  } catch (error) {
    console.error(`❌ Request failed: ${url}`, error);
    throw error;
  }
};
```

### Cache Warming Strategies

```typescript
// Pre-warm critical cache entries
async function warmCache() {
  const criticalEndpoints = [
    '/api/config',
    '/api/user/settings',
    '/api/navigation'
  ];
  
  const warmingFetch = createFetch({
    cache: await caches.open('warm-cache'),
    defaultCacheControl: 's-maxage=3600', // Long cache for config data
  });
  
  await Promise.allSettled(
    criticalEndpoints.map(endpoint => 
      warmingFetch(endpoint).catch(err => 
        console.warn(`Failed to warm cache for ${endpoint}:`, err)
      )
    )
  );
  
  console.log('Cache warming completed');
}

// Call during application startup
warmCache();
```

## 📋 Standards Compliance

SharedCache demonstrates **exceptional HTTP standards compliance**, fully adhering to established web caching specifications:

### ✅ HTTP Caching Standards (RFC 7234)

**Complete Compliance Features:**

- **Cache Control Directives**: Proper handling of `no-store`, `no-cache`, `private`, `public`, `s-maxage`, and `max-age`
- **HTTP Method Support**: Standards-compliant caching for GET/HEAD methods with correct rejection of non-cacheable methods
- **Status Code Handling**: Appropriate caching behavior for 200, 301, 404 responses and proper rejection of 5xx errors
- **Vary Header Processing**: Full content negotiation support with intelligent cache key generation
- **Conditional Requests**: Complete ETag and Last-Modified validation with 304 Not Modified handling

### ✅ RFC 5861 Extensions

- **stale-while-revalidate**: Background revalidation with immediate stale content serving
- **stale-if-error**: Graceful degradation serving cached content during network failures
- **Fault Tolerance**: Robust error handling and recovery mechanisms

### ✅ Web Cache API Compatibility

SharedCache implements a **subset** of the standard Web Cache API interface, focusing on core caching operations:

```typescript
// Implemented methods
interface SharedCache {
  match(request: RequestInfo | URL): Promise<Response | undefined>  // ✅ Implemented
  put(request: RequestInfo | URL, response: Response): Promise<void>  // ✅ Implemented
  delete(request: RequestInfo | URL): Promise<boolean>  // ✅ Implemented
  
  // Not implemented - throw "not implemented" errors
  add(request: RequestInfo | URL): Promise<void>  // ❌ Throws error
  addAll(requests: RequestInfo[]): Promise<void>  // ❌ Throws error
  keys(): Promise<readonly Request[]>  // ❌ Throws error
  matchAll(): Promise<readonly Response[]>  // ❌ Throws error
}
```

**Implementation Status:**

- **✅ Core Methods**: `match()`, `put()`, `delete()` - Fully implemented with HTTP semantics
- **❌ Convenience Methods**: `add()`, `addAll()` - Use `put()` instead  
- **❌ Enumeration Methods**: `keys()`, `matchAll()` - Not available in server environments

**Options Parameter Differences:**

SharedCache's `CacheQueryOptions` interface differs from the standard Web Cache API:

```typescript
// Standard Web Cache API CacheQueryOptions
interface WebCacheQueryOptions {
  ignoreSearch?: boolean;   // ❌ Not implemented - throws error
  ignoreMethod?: boolean;   // ✅ Supported
  ignoreVary?: boolean;     // ❌ Not implemented - throws error
}

// SharedCache CacheQueryOptions  
interface SharedCacheQueryOptions {
  ignoreMethod?: boolean;   // ✅ Only supported option
  // Other standard options throw "not implemented" errors
}
```

**Supported Options:**

- **✅ `ignoreMethod`**: Treat request as GET regardless of actual HTTP method

**Unsupported Options (throw errors):**

- **❌ `ignoreSearch`**: Query string handling not customizable
- **❌ `ignoreVary`**: Vary header processing not bypassable

### 📊 Compliance Summary

| Standard | Status | Coverage |
|----------|--------|----------|
| **RFC 7234** (HTTP Caching) | ✅ Fully Compliant | 100% |
| **RFC 5861** (stale-* extensions) | ✅ Fully Compliant | 100% |
| **Web Cache API** | ✅ Subset Implementation | Core Methods |
| **WinterCG Standards** | ✅ Fully Supported | 100% |

### 🛡️ Production-Grade Implementation

- **Professional HTTP Semantics**: Powered by `http-cache-semantics` library for guaranteed RFC compliance
- **Intelligent Cache Strategies**: Advanced cache key generation with URL normalization and parameter filtering
- **Robust Error Handling**: Comprehensive exception handling with graceful degradation
- **Performance Optimized**: Efficient storage backends with configurable TTL and cleanup strategies

### 🛡️ Security & Best Practices

- **Privacy Compliance**: Correct handling of `private` directive for user-specific content
- **Shared Cache Optimization**: Priority given to `s-maxage` over `max-age` for multi-user environments
- **Authorization Header Handling**: Automatic compliance with HTTP specification - responses to requests with `Authorization` headers are not cached in shared caches unless explicitly permitted by response cache control directives
- **Cache Isolation**: Proper separation of cached content based on user context and authentication state
- **Secure Defaults**: Conservative caching policies with explicit opt-in for sensitive operations

**🔒 Important Security Note**: SharedCache automatically enforces HTTP caching security rules. Requests containing `Authorization` headers will not be cached unless the response explicitly allows it with directives like `public`, `s-maxage`, or `must-revalidate`. This ensures compliance with shared cache security requirements.

**SharedCache is production-ready and battle-tested**, providing enterprise-grade HTTP caching with full standards compliance for server-side applications.

## ❓ Frequently Asked Questions

### Q: Can I use SharedCache with Next.js?

**A:** Yes! SharedCache works perfectly with Next.js applications, especially in API routes and middleware:

```typescript
// pages/api/data.ts or app/api/data/route.ts
import { createFetch } from '@web-widget/shared-cache';

const cachedFetch = createFetch({
  cache: await caches.open('nextjs-api'),
  defaultCacheControl: 's-maxage=300',
});

export async function GET() {
  const data = await cachedFetch('https://external-api.com/data');
  return Response.json(await data.json());
}
```

### Q: How do I handle cache invalidation?

**A:** Use the cache's `delete` method or set short TTLs for frequently changing data:

```typescript
// Manual invalidation
await cache.delete('/api/user/profile');

// Or use shorter cache times for dynamic content
const fetch = createFetch({
  cache,
  defaultCacheControl: 's-maxage=30', // 30 seconds for dynamic data
});
```

### Q: Can I use different storage backends in production?

**A:** Absolutely! SharedCache supports any storage backend that implements the `KVStorage` interface:

```typescript
// Redis example
const redisStorage: KVStorage = {
  async get(key) { return JSON.parse(await redis.get(key) || 'null'); },
  async set(key, value, ttl) { await redis.setex(key, ttl/1000, JSON.stringify(value)); },
  async delete(key) { return await redis.del(key) > 0; }
};
```

### Q: How does SharedCache handle concurrent requests?

**A:** SharedCache handles concurrent requests to the same resource efficiently by serving existing cache entries and avoiding duplicate network requests during cache misses.

### Q: Is SharedCache compatible with edge runtimes?

**A:** Yes! SharedCache is built for WinterCG compliance and works with Cloudflare Workers, Vercel Edge Runtime, Deno Deploy, and other edge environments.

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
