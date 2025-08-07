# SharedCache

[![CI](https://github.com/web-widget/shared-cache/actions/workflows/test.yml/badge.svg?event=push)](https://github.com/web-widget/shared-cache/actions/workflows/test.yml?query=event%3Apush)
[![npm version](https://img.shields.io/npm/v/@web-widget/shared-cache.svg)](https://www.npmjs.com/package/@web-widget/shared-cache)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![codecov](https://codecov.io/gh/web-widget/shared-cache/branch/main/graph/badge.svg)](https://codecov.io/gh/web-widget/shared-cache)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Deno](https://img.shields.io/badge/Deno-Compatible-brightgreen.svg)](https://deno.land/)
[![Bun](https://img.shields.io/badge/Bun-Compatible-orange.svg)](https://bun.sh/)
[![WinterCG](https://img.shields.io/badge/WinterCG-Compatible-blue.svg)](https://wintercg.org/)
[![RFC Compliant](https://img.shields.io/badge/RFC%207234-Compliant-green.svg)](https://tools.ietf.org/html/rfc7234)

**A standards-compliant HTTP cache implementation for server-side applications.**

SharedCache is an HTTP caching library that follows Web Standards and HTTP specifications. It implements a cache interface similar to the [Web Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) but optimized for server-side shared caching scenarios.

## 📋 Table of Contents

- [✨ Key Features](#-key-features)
- [🤔 Why SharedCache?](#-why-sharedcache)
- [⚡ Quick Decision Guide](#-quick-decision-guide)
- [📦 Installation](#-installation)
- [🚀 Quick Start](#-quick-start)
- [💡 Common Examples](#-common-examples)
- [📊 Cache Status Monitoring](#-cache-status-monitoring)
- [📝 Logging and Debugging](#-logging-and-debugging)
- [🌐 Global Setup](#-global-setup)
- [🎛️ Advanced Configuration](#️-advanced-configuration)
- [📚 API Reference](#-api-reference)
- [📋 Standards Compliance](#-standards-compliance)
- [❓ Frequently Asked Questions](#-frequently-asked-questions)
- [🤝 Who's Using SharedCache](#-whos-using-sharedcache)
- [🙏 Acknowledgments](#-acknowledgments)
- [📄 License](#-license)

## ✨ Key Features

- **📋 RFC Compliance**: Supports [RFC 5861](https://tools.ietf.org/html/rfc5861) directives like `stale-if-error` and `stale-while-revalidate`
- **🎯 Smart Caching**: Handles complex HTTP scenarios including `Vary` headers, proxy revalidation, and authenticated responses
- **🔧 Flexible Storage**: Pluggable storage backend supporting memory, Redis, or any custom key-value store
- **🚀 Enhanced Fetch**: Extends the standard `fetch` API with caching capabilities while maintaining full compatibility
- **🎛️ Custom Cache Keys**: Cache key customization supporting device types, cookies, headers, and URL components
- **⚡ Shared Cache Optimization**: Prioritizes `s-maxage` over `max-age` for shared cache performance
- **🌍 Universal Runtime**: Compatible with [WinterCG](https://wintercg.org/) environments including Node.js, Deno, Bun, and Edge Runtime

## 🤔 Why SharedCache?

While the Web `fetch` API has become ubiquitous in server-side JavaScript, existing browser Cache APIs are designed for single-user scenarios. Server-side applications need **shared caches** that serve multiple users efficiently.

SharedCache provides:

- **Server-Optimized Caching**: Designed for multi-user server environments
- **Standards Compliance**: Follows HTTP specifications and server-specific patterns
- **Production Ready**: Battle-tested patterns from CDN and proxy implementations

## ⚡ Quick Decision Guide

### ✅ Use SharedCache When:

- **Node.js environments** - Native `caches` API not available
- **API response caching** - Need to reduce backend load and improve response times
- **Cross-runtime portability** - Want consistent caching across Node.js, Deno, Bun
- **Custom storage backends** - Need Redis, database, or distributed caching solutions
- **Meta-framework development** - Building applications that deploy to multiple environments

### ❌ Don't Use SharedCache When:

- **Edge runtimes with native caches** - Cloudflare Workers, Vercel Edge already provide `caches` API
- **Browser applications** - Use the native Web Cache API instead (unless you need HTTP cache control directives support)
- **Simple in-memory caching** - Consider lighter alternatives like `lru-cache` directly
- **Single-request caching** - Basic memoization might be sufficient

### 🎯 Primary Use Cases

#### **Server-Side API Caching**

```typescript
// Cache API responses to reduce backend load
const apiFetch = createFetch(cache, {
  defaults: { cacheControlOverride: 's-maxage=300' },
});
const userData = await apiFetch('/api/user/profile'); // First: 200ms, subsequent: 2ms
```

#### **Server-Side Page Caching**

```typescript
// Cache rendered pages using HTTP cache control directives
export const handler = {
  async GET(ctx) {
    const response = await ctx.render();

    // Set cache control headers for shared cache optimization
    response.headers.set(
      'cache-control',
      's-maxage=60, ' + // Cache for 60 seconds in shared caches
        'stale-if-error=604800, ' + // Serve stale content for 7 days on errors
        'stale-while-revalidate=604800' // Background revalidation for 7 days
    );

    return response;
  },
};
```

**Integration Requirements**: This pattern requires web framework integration with SharedCache middleware or custom cache implementation in your SSR pipeline.

#### **Cross-Runtime Applications**

```typescript
// Same code works in Node.js, Deno, Bun, and Edge Runtime
const fetch = createFetch(cache);
// Deploy anywhere without code changes
```

#### **Distributed Caching**

```typescript
// Redis backend for multi-instance applications
const caches = new CacheStorage(createRedisStorage());
const cache = await caches.open('distributed-cache');
```

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

  // Create fetch with default configuration
  const fetch = createFetch(cache, {
    defaults: {
      cacheControlOverride: 's-maxage=300', // 5 minutes default caching
      ignoreRequestCacheControl: true,
    },
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

### API Notes

This package exports a comprehensive set of APIs for HTTP caching functionality:

```typescript
import {
  createFetch, // Main fetch function with caching
  Cache, // SharedCache class
  CacheStorage, // SharedCacheStorage class
} from '@web-widget/shared-cache';

const cache = await caches.open('api-cache-v1');
const fetch = createFetch(cache, {
  defaults: {
    cacheControlOverride: 's-maxage=300',
    ignoreRequestCacheControl: true,
  },
});
```

## 💡 Common Examples

### Basic API Caching

```typescript
import { createFetch } from '@web-widget/shared-cache';

const cache = await caches.open('api-cache-v1');
const fetch = createFetch(cache, {
  defaults: {
    cacheControlOverride: 's-maxage=300', // 5 minutes default
  },
});

// Simple usage - automatic caching
const userData = await fetch('/api/user/profile');
const sameData = await fetch('/api/user/profile'); // Served from cache
```

### Redis Backend

```typescript
import Redis from 'ioredis';
import {
  CacheStorage,
  createFetch,
  type KVStorage,
} from '@web-widget/shared-cache';

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
const fetch = createFetch(cache, {
  defaults: {
    cacheControlOverride: 's-maxage=600',
    cacheKeyRules: {
      header: { include: ['x-tenant-id'] }, // Multi-tenant support
    },
  },
});
```

### Device-Specific Caching

```typescript
const deviceAwareFetch = createFetch(await caches.open('content-cache'), {
  defaults: {
    cacheControlOverride: 's-maxage=600',
    cacheKeyRules: {
      device: true, // Separate cache for mobile/desktop/tablet
      search: { exclude: ['timestamp'] },
    },
  },
});

const response = await deviceAwareFetch('/api/content');
```

### Advanced Cache Key Rules

```typescript
const advancedFetch = createFetch(await caches.open('advanced-cache'), {
  defaults: {
    cacheControlOverride: 's-maxage=300, stale-while-revalidate=3600',
    cacheKeyRules: {
      search: { exclude: ['timestamp', '_'] },
      header: { include: ['x-api-version'] },
      cookie: { include: ['session_id'] },
      device: true,
    },
  },
});
```

### Custom Storage Backend

```typescript
import crypto from 'crypto';

const createEncryptedStorage = (
  baseStorage: KVStorage,
  key: string
): KVStorage => {
  const encrypt = (text: string) => {
    const cipher = crypto.createCipher('aes192', key);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  };

  const decrypt = (text: string) => {
    const decipher = crypto.createDecipher('aes192', key);
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  };

  return {
    async get(cacheKey: string) {
      const encrypted = await baseStorage.get(cacheKey);
      return encrypted ? JSON.parse(decrypt(encrypted as string)) : undefined;
    },
    async set(cacheKey: string, value: unknown, ttl?: number) {
      const encrypted = encrypt(JSON.stringify(value));
      return baseStorage.set(cacheKey, encrypted, ttl);
    },
    async delete(cacheKey: string) {
      return baseStorage.delete(cacheKey);
    },
  };
};

const secureStorage = createEncryptedStorage(baseStorage, 'my-secret-key');
const caches = new CacheStorage(secureStorage);
```

### Multi-tenant Caching

```typescript
const tenantFetch = createFetch(await caches.open('tenant-cache'), {
  defaults: {
    cacheControlOverride: 's-maxage=300',
    cacheKeyRules: {
      header: { include: ['x-tenant-id'] },
      search: true,
    },
  },
});

// Each tenant gets isolated cache
const response = await tenantFetch('/api/data', {
  headers: { 'x-tenant-id': 'tenant-123' },
});
```

### Custom Fetch with Authentication

```typescript
// Production-ready example with automatic token refresh
const createAuthenticatedFetch = (getToken) => {
  return async (input, init) => {
    const token = await getToken();
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);

    const response = await globalThis.fetch(input, {
      ...init,
      headers,
    });

    // Handle token expiration
    if (response.status === 401) {
      // Token might be expired, retry once with fresh token
      const freshToken = await getToken(true); // force refresh
      headers.set('Authorization', `Bearer ${freshToken}`);

      return globalThis.fetch(input, {
        ...init,
        headers,
      });
    }

    return response;
  };
};

const authFetch = createFetch(await caches.open('authenticated-api'), {
  fetch: createAuthenticatedFetch(() => getApiToken()),
  defaults: {
    cacheControlOverride:
      'public, ' + // Required: Allow caching of authenticated requests
      's-maxage=300',
    cacheKeyRules: {
      header: { include: ['authorization'] }, // Cache per token
    },
  },
});

const userData = await authFetch('/api/user/profile');
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
    ttl: 1000 * 60 * 60, // 1 hour default TTL
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

// Replace global fetch with cached version
globalThis.fetch = createFetch(await caches.open('default'), {
  defaults: {
    cacheControlOverride: 's-maxage=60', // 1 minute default for global fetch
  },
});
```

## 🎛️ Advanced Configuration

### Enhanced Fetch API with Defaults

The `createFetch` API allows you to set default cache configuration:

```typescript
import { createFetch } from '@web-widget/shared-cache';

const cache = await caches.open('api-cache');

// Create fetch with comprehensive defaults
const fetch = createFetch(cache, {
  defaults: {
    cacheControlOverride: 's-maxage=300',
    cacheKeyRules: {
      header: { include: ['x-api-version'] },
    },
    ignoreRequestCacheControl: true,
    ignoreVary: false,
  },
});

// Use with defaults applied automatically
const response1 = await fetch('/api/data');

// Override defaults for specific requests
const response2 = await fetch('/api/data', {
  sharedCache: {
    cacheControlOverride: 's-maxage=600', // Override default
  },
});
```

### Custom Fetch Configuration

The `createFetch` function accepts a custom fetch implementation, allowing you to integrate with existing HTTP clients or add cross-cutting concerns:

```typescript
// Example: Integration with axios
import axios from 'axios';

const axiosFetch = async (input, init) => {
  const response = await axios({
    url: input.toString(),
    method: init?.method || 'GET',
    headers: init?.headers,
    data: init?.body,
    validateStatus: () => true, // Don't throw on 4xx/5xx
  });

  return new Response(response.data, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

const fetch = createFetch(await caches.open('axios-cache'), {
  fetch: axiosFetch,
  defaults: {
    cacheControlOverride: 's-maxage=300',
  },
});

// Example: Custom fetch with request/response transformation
const transformFetch = async (input, init) => {
  // Transform request
  const url = new URL(input);
  url.searchParams.set('timestamp', Date.now().toString());

  const response = await globalThis.fetch(url, init);

  // Transform response
  if (response.headers.get('content-type')?.includes('application/json')) {
    const data = await response.json();
    const transformedData = {
      ...data,
      fetchedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify(transformedData), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  return response;
};

const transformedFetch = createFetch(await caches.open('transform-cache'), {
  fetch: transformFetch,
  defaults: {
    cacheControlOverride: 's-maxage=300',
  },
});
```

### Enhanced Fetch API

SharedCache extends the standard fetch API with caching options via the `sharedCache` parameter:

```typescript
const cache = await caches.open('api-cache');
const fetch = createFetch(cache);

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
      search: false,
      device: true,
      header: {
        include: ['x-user-id'],
      },
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
  cacheControlOverride: 's-maxage=3600';
}

// Combine multiple directives
sharedCache: {
  cacheControlOverride: 's-maxage=3600, must-revalidate';
}
```

#### `varyOverride`

Add additional Vary headers to ensure proper cache segmentation:

```typescript
sharedCache: {
  varyOverride: 'accept-language, user-agent';
}
```

#### `ignoreRequestCacheControl`

Control whether to honor cache-control directives from the request:

```typescript
// Ignore client cache-control headers (default: true)
sharedCache: {
  ignoreRequestCacheControl: false;
}
```

#### `ignoreVary`

Disable Vary header processing for simplified caching:

```typescript
sharedCache: {
  ignoreVary: true; // Cache regardless of Vary headers
}
```

**⚠️ Performance Warning**: By default, SharedCache processes Vary headers which requires **two KV storage queries** per cache lookup. If you're using a slow KV storage (like remote Redis), this can significantly impact performance. Consider setting `ignoreVary: true` to disable Vary processing and use only one query per lookup.

#### `cacheKeyRules`

Customize how cache keys are generated to optimize cache hit rates and handle different caching scenarios:

```typescript
sharedCache: {
  cacheKeyRules: {
    // URL components
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
  search: true,
}
```

### Cache Key Components

#### **URL Components**

- **`search`**: Control query parameter inclusion

**Query Parameter Control:**

```typescript
// Include all query parameters (default)
search: true;

// Exclude all query parameters
search: false;

// Include specific parameters
search: {
  include: ['category', 'page'];
}

// Include all except specific parameters
search: {
  exclude: ['timestamp', 'nonce'];
}
```

#### **Device Classification**

Automatically classify requests as `mobile`, `desktop`, or `tablet` based on User-Agent:

```typescript
cacheKeyRules: {
  device: true; // Separate cache for different device types
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

## 📊 Cache Status Monitoring

SharedCache provides comprehensive monitoring through the `x-cache-status` header for debugging and performance analysis.

### Cache Status Types

| Status            | Description                                     | When It Occurs                                               |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| **`HIT`**         | Response served from cache                      | The requested resource was found in cache and is still fresh |
| **`MISS`**        | Response fetched from origin                    | The requested resource was not found in cache                |
| **`EXPIRED`**     | Cached response expired, fresh response fetched | The cached response exceeded its TTL                         |
| **`STALE`**       | Stale response served                           | Served due to stale-while-revalidate or stale-if-error       |
| **`BYPASS`**      | Cache bypassed                                  | Bypassed due to cache control directives like `no-store`     |
| **`REVALIDATED`** | Cached response revalidated                     | Response validated with origin (304 Not Modified)            |
| **`DYNAMIC`**     | Response cannot be cached                       | Cannot be cached due to HTTP method or status code           |

### Cache Status Header Details

The `x-cache-status` header is automatically added to all responses:

- **Header Values**: `HIT`, `MISS`, `EXPIRED`, `STALE`, `BYPASS`, `REVALIDATED`, `DYNAMIC`
- **Always Present**: The header is always added for monitoring and debugging
- **Non-Standard**: Custom header for debugging - should not be used for application logic

## 📝 Logging and Debugging

SharedCache provides a comprehensive logging system with structured output for monitoring and debugging cache operations.

### Logger Interface

```typescript
interface Logger {
  info(message?: unknown, ...optionalParams: unknown[]): void;
  warn(message?: unknown, ...optionalParams: unknown[]): void;
  debug(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}
```

### Basic Logger Setup

```typescript
import { createLogger, LogLevel } from '@web-widget/shared-cache';

// Create a simple console logger
const logger = {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  debug: console.debug.bind(console),
  error: console.error.bind(console),
};

// Create SharedCache with logger
const cache = new SharedCache(storage, {
  logger,
});
```

### Log Levels

#### DEBUG

- **Purpose**: Detailed operational information for development and troubleshooting
- **Content**: Cache lookups, key generation, policy decisions
- **Example Output**:
  ```
  SharedCache: Cache miss { url: 'https://api.com/data', cacheKey: 'api:data', method: 'GET' }
  SharedCache: Cache item found { url: 'https://api.com/data', cacheKey: 'api:data', method: 'GET' }
  ```

#### INFO

- **Purpose**: Normal operational messages about successful operations
- **Content**: Cache hits, revalidation results, stale responses
- **Example Output**:
  ```
  SharedCache: Cache hit { url: 'https://api.com/data', cacheKey: 'api:data', cacheStatus: 'HIT' }
  SharedCache: Serving stale response - Revalidating in background { url: 'https://api.com/data', cacheKey: 'api:data', cacheStatus: 'STALE' }
  ```

#### WARN

- **Purpose**: Potentially problematic situations that don't prevent operation
- **Content**: Network errors with fallback, deprecated usage
- **Example Output**:
  ```
  SharedCache: Revalidation network error - Using fallback 500 response { url: 'https://api.com/data', cacheKey: 'api:data', error: [NetworkError] }
  ```

#### ERROR

- **Purpose**: Critical issues that prevent normal operation
- **Content**: Storage failures, revalidation failures, validation errors
- **Example Output**:
  ```
  SharedCache: Put operation failed { url: 'https://api.com/data', error: [StorageError] }
  SharedCache: Revalidation failed - Server returned 5xx status { url: 'https://api.com/data', status: 503, cacheKey: 'api:data' }
  ```

### Logger Configuration Examples

#### Production Logging (INFO level)

```typescript
const productionLogger = {
  info: (msg, ctx) =>
    console.log(JSON.stringify({ level: 'INFO', message: msg, ...ctx })),
  warn: (msg, ctx) =>
    console.warn(JSON.stringify({ level: 'WARN', message: msg, ...ctx })),
  debug: () => {}, // No debug in production
  error: (msg, ctx) =>
    console.error(JSON.stringify({ level: 'ERROR', message: msg, ...ctx })),
};

const cache = new SharedCache(storage, {
  logger: productionLogger,
});
```

#### Development Logging (DEBUG level)

```typescript
const devLogger = {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  debug: console.debug.bind(console),
  error: console.error.bind(console),
};

const cache = new SharedCache(storage, {
  logger: devLogger,
});
```

#### Structured Logger with Level Filtering

```typescript
import { createLogger, LogLevel } from '@web-widget/shared-cache';

class CustomLogger {
  info(message: unknown, ...params: unknown[]) {
    this.log('INFO', message, ...params);
  }

  warn(message: unknown, ...params: unknown[]) {
    this.log('WARN', message, ...params);
  }

  debug(message: unknown, ...params: unknown[]) {
    this.log('DEBUG', message, ...params);
  }

  error(message: unknown, ...params: unknown[]) {
    this.log('ERROR', message, ...params);
  }

  private log(level: string, message: unknown, ...params: unknown[]) {
    const timestamp = new Date().toISOString();
    const context = params[0] || {};
    console.log(
      JSON.stringify({
        timestamp,
        level,
        service: 'shared-cache',
        message,
        ...context,
      })
    );
  }
}

const customLogger = new CustomLogger();
const structuredLogger = createLogger(customLogger, LogLevel.DEBUG);

const cache = new SharedCache(storage, {
  logger: customLogger,
});
```

### Context Data Structure

All log messages include structured context data:

```typescript
interface SharedCacheLogContext {
  url?: string; // Request URL
  cacheKey?: string; // Generated cache key
  status?: number; // HTTP status code
  duration?: number; // Operation duration (ms)
  error?: unknown; // Error object
  cacheStatus?: string; // Cache result status
  ttl?: number; // Time to live (seconds)
  method?: string; // HTTP method
  [key: string]: unknown; // Additional context
}
```

### Best Practices

1. **Use appropriate log levels**: Don't log normal operations at ERROR level
2. **Include relevant context**: URL, cache key, and timing information help with debugging
3. **Filter by environment**: Use DEBUG level in development, INFO+ in production
4. **Monitor error logs**: Set up alerts for ERROR level messages
5. **Structure your data**: Use consistent context object structures for easier parsing

### Performance Considerations

- **DEBUG level**: Can be verbose in high-traffic scenarios. Use sparingly in production
- **Structured data**: Context objects are not deeply cloned. Avoid modifying context after logging
- **Async operations**: Background revalidation errors are properly caught and logged without blocking responses

### Advanced Debugging Techniques

#### Cache Hit Rate Monitoring

```typescript
import { createLogger, LogLevel } from '@web-widget/shared-cache';

let hitCount = 0;
let totalCount = 0;

const monitoringLogger = {
  info: (message, context) => {
    if (context?.cacheStatus) {
      totalCount++;
      if (context.cacheStatus === 'HIT') hitCount++;

      // Log hit rate every 100 requests
      if (totalCount % 100 === 0) {
        console.log(
          `Cache hit rate: ${((hitCount / totalCount) * 100).toFixed(2)}%`
        );
      }
    }
    console.log(message, context);
  },
  warn: console.warn,
  debug: console.debug,
  error: console.error,
};

const cache = new SharedCache(storage, {
  logger: createLogger(monitoringLogger, LogLevel.INFO),
});
```

#### Performance Tracking

```typescript
const performanceLogger = {
  info: (message, context) => {
    if (context?.duration) {
      console.log(`${message} - Duration: ${context.duration}ms`, context);
    } else {
      console.log(message, context);
    }
  },
  warn: console.warn,
  debug: console.debug,
  error: console.error,
};
```

#### Custom Alerting

```typescript
const alertingLogger = {
  info: console.log,
  warn: console.warn,
  debug: console.debug,
  error: (message, context) => {
    console.error(message, context);

    // Send alerts for critical cache errors
    if (context?.error && message.includes('Put operation failed')) {
      sendAlert(`Cache storage error: ${context.error.message}`);
    }
  },
};
```

## 📚 API Reference

### Core API Overview

**Main Functions:**

- `createFetch(cache?, options?)` - Create cached fetch function
- `createLogger(logger?, logLevel?, prefix?)` - Create logger with level filtering

**Classes:**

- `Cache` - Main cache implementation
- `CacheStorage` - Cache storage manager

**Key Types:**

- `KVStorage` - Storage backend interface
- `SharedCacheRequestInitProperties` - Request cache configuration
- `SharedCacheKeyRules` - Cache key generation rules

---

### createFetch Function

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

- `cache` - Optional SharedCache instance (auto-discovered from globalThis.caches if not provided)
- `options.fetch` - Custom fetch implementation to use as the underlying fetcher (defaults to globalThis.fetch)
- `options.defaults` - Default shared cache options to apply to all requests

**Returns:** `SharedCacheFetch` - A fetch function with caching capabilities

**Basic Usage:**

```typescript
const cache = await caches.open('my-cache');
const fetch = createFetch(cache, {
  defaults: { cacheControlOverride: 's-maxage=300' },
});
```

### Key Interfaces

#### SharedCacheRequestInitProperties

Request-level cache configuration:

```typescript
interface SharedCacheRequestInitProperties {
  cacheControlOverride?: string;
  cacheKeyRules?: SharedCacheKeyRules;
  ignoreRequestCacheControl?: boolean;
  ignoreVary?: boolean;
  varyOverride?: string;
  event?: ExtendableEvent;
}
```

#### SharedCacheKeyRules

Cache key generation rules:

```typescript
interface SharedCacheKeyRules {
  cookie?: FilterOptions | boolean;
  device?: FilterOptions | boolean;
  header?: FilterOptions | boolean;
  search?: FilterOptions | boolean;
}
```

#### KVStorage

Storage backend interface:

```typescript
interface KVStorage {
  get: (cacheKey: string) => Promise<unknown | undefined>;
  set: (cacheKey: string, value: unknown, ttl?: number) => Promise<void>;
  delete: (cacheKey: string) => Promise<boolean>;
}
```

### Classes

#### Cache / CacheStorage

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

### Utilities

#### `createLogger(logger?, logLevel?, prefix?)`

```typescript
const logger = createLogger(console, LogLevel.INFO, 'MyApp');
```

Creates a structured logger with level filtering and optional prefix.

#### Cache Status Values

```typescript
type SharedCacheStatus =
  | 'HIT'
  | 'MISS'
  | 'EXPIRED'
  | 'STALE'
  | 'BYPASS'
  | 'REVALIDATED'
  | 'DYNAMIC';
```

Status values are automatically added to response headers as `x-cache-status`.

**Complete API documentation available in TypeScript definitions and source code.**

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
interface Cache {
  match(request: RequestInfo | URL): Promise<Response | undefined>; // ✅ Implemented
  put(request: RequestInfo | URL, response: Response): Promise<void>; // ✅ Implemented
  delete(request: RequestInfo | URL): Promise<boolean>; // ✅ Implemented

  // Not implemented - throw "not implemented" errors
  add(request: RequestInfo | URL): Promise<void>; // ❌ Throws error
  addAll(requests: RequestInfo[]): Promise<void>; // ❌ Throws error
  keys(): Promise<readonly Request[]>; // ❌ Throws error
  matchAll(): Promise<readonly Response[]>; // ❌ Throws error
}
```

**Implementation Status:**

- **✅ Core Methods**: `match()`, `put()`, `delete()` - Fully implemented with HTTP semantics
- **❌ Convenience Methods**: `add()`, `addAll()` - Use `put()` instead
- **❌ Enumeration Methods**: `keys()`, `matchAll()` - Not available in server environments

**Options Parameter Differences:**

SharedCache's `CacheQueryOptions` interface differs from the standard Web Cache API:

```typescript
interface CacheQueryOptions {
  ignoreSearch?: boolean; // ❌ Not implemented - throws error
  ignoreMethod?: boolean; // ✅ Supported
  ignoreVary?: boolean; // ❌ Not implemented - throws error
}
```

**Supported Options:**

- **✅ `ignoreMethod`**: Treat request as GET regardless of actual HTTP method

**Unsupported Options (throw errors):**

- **❌ `ignoreSearch`**: Query string handling not customizable
- **❌ `ignoreVary`**: Vary header processing not bypassable (Note: This option is actually supported in SharedCache)

### 📊 Compliance Summary

| Standard                           | Status                   | Coverage     |
| ---------------------------------- | ------------------------ | ------------ |
| **RFC 7234** (HTTP Caching)        | ✅ Fully Compliant       | 100%         |
| **RFC 5861** (stale-\* extensions) | ✅ Fully Compliant       | 100%         |
| **Web Cache API**                  | ✅ Subset Implementation | Core Methods |
| **WinterCG Standards**             | ✅ Fully Supported       | 100%         |

### 🛡️ Production-Grade Implementation

- **Professional HTTP Semantics**: Powered by `http-cache-semantics` for RFC compliance
- **Intelligent Cache Strategies**: Advanced cache key generation with URL normalization
- **Robust Error Handling**: Comprehensive exception handling with graceful degradation
- **Performance Optimized**: Efficient storage backends with configurable TTL

### 🛡️ Security & Best Practices

- **Privacy Compliance**: Correct handling of `private` directive for user-specific content
- **Shared Cache Optimization**: Priority given to `s-maxage` over `max-age` for multi-user environments
- **Authorization Header Handling**: Automatic compliance with HTTP specification - responses to requests with `Authorization` headers are not cached in shared caches unless explicitly permitted by response cache control directives
- **Cache Isolation**: Proper separation of cached content based on user context and authentication state
- **Secure Defaults**: Conservative caching policies with explicit opt-in for sensitive operations

**🔒 Important Security Note**: SharedCache automatically enforces HTTP caching security rules. Requests containing `Authorization` headers will not be cached unless the response explicitly allows it with directives like `public`, `s-maxage`, or `must-revalidate`. This ensures compliance with shared cache security requirements.

**SharedCache is production-ready and battle-tested**, providing enterprise-grade HTTP caching with full standards compliance for server-side applications.

## ❓ Frequently Asked Questions

### Q: Can I use different storage backends in production?

**A:** Absolutely! SharedCache supports any storage backend that implements the `KVStorage` interface:

```typescript
// Redis example
const redisStorage: KVStorage = {
  async get(key) {
    return JSON.parse((await redis.get(key)) || 'null');
  },
  async set(key, value, ttl) {
    await redis.setex(key, ttl / 1000, JSON.stringify(value));
  },
  async delete(key) {
    return (await redis.del(key)) > 0;
  },
};
```

### Q: How does SharedCache handle concurrent requests?

**A:** SharedCache handles concurrent requests efficiently by serving cache entries and avoiding duplicate network requests.

### Q: Is SharedCache compatible with edge runtimes?

**A:** SharedCache is technically compatible with edge runtimes, but it's typically **not needed** in edge environments. Most edge runtimes (Cloudflare Workers, Vercel Edge Runtime, Deno Deploy) already provide native `caches` API implementation.

**Primary Use Cases for SharedCache:**

- **Node.js environments** - Where the `caches` API is not natively available
- **Development environments** - For consistent caching behavior across different runtimes
- **Meta-frameworks** - Like [Web Widget](https://github.com/web-widget/web-widget) that enable seamless migration between environments
- **Custom storage backends** - When you need Redis, database, or other storage solutions

**Migration Benefits:**

When using SharedCache with meta-frameworks, you can develop with a consistent caching API and deploy to any environment - whether it has native `caches` support or not. This provides true runtime portability for your caching logic.

### Q: What's the value of `stale-while-revalidate` and `stale-if-error` directives?

**A:** These RFC 5861 extensions provide significant performance and reliability benefits:

- **stale-while-revalidate**: Serves cached content immediately while updating in background, providing zero-latency responses
- **stale-if-error**: Serves cached content when origin servers fail, improving uptime and user experience

### Q: How does SharedCache handle Vary headers and what are the performance implications?

**A:** SharedCache processes Vary headers by default, which requires **two KV storage queries** per cache lookup:

1. First query: Get Vary metadata from base cache key
2. Second query: Get actual response from variant cache key

**Performance Impact:**
- **Local Redis**: Minimal impact (0.2-1ms additional latency)
- **Remote Redis**: Significant impact (4-20ms additional latency)
- **Database storage**: High impact (10-50ms additional latency)

**Recommendation for slow storage:**
```typescript
// Disable Vary processing for better performance
const fetch = createFetch(cache, {
  sharedCache: {
    ignoreVary: true, // Reduces to single query per lookup
  },
});
```

**Trade-offs:**
- **With Vary**: RFC compliant, supports content negotiation, but slower
- **Without Vary**: Faster performance, but may serve incorrect content for requests with different headers

```typescript
// Best practice: Use both directives together
const fetch = createFetch(cache, {
  defaults: {
    cacheControlOverride:
      's-maxage=300, stale-while-revalidate=86400, stale-if-error=86400',
  },
});
```

## 🤝 Who's Using SharedCache

- [Web Widget Meta Framework: Cache middleware](https://github.com/web-widget/web-widget/blob/main/packages/middlewares/src/cache.ts)
- [InsMind.com: Page Cache](https://www.insmind.com/)
- [Gaoding.com: Page Cache (Million-level URLs)](https://www.gaoding.com/)

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
