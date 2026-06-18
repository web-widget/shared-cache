# Configuration

[← Back to README](../README.md) · [Documentation index](./README.md)

## Global Setup

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

## Advanced Configuration

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

**Default cache key rules:** Keys look like `https://example.com/path?a=1` (full request URL). Query parameters are included by default (`search: true`).

### Cache Key Components

#### URL Components

- **`search`**: Control query parameter inclusion

**Query parameter control:**

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

#### Device Classification

Automatically classify requests as `mobile`, `desktop`, or `tablet` based on User-Agent:

```typescript
cacheKeyRules: {
  device: true; // Separate cache for different device types
}
```

#### Cookie-Based Caching

Include specific cookies in the cache key:

```typescript
cacheKeyRules: {
  cookie: {
    include: ['user_id', 'session_token'],
    checkPresence: ['is_premium']  // Check existence without value
  }
}
```

#### Header-Based Caching

Include request headers in the cache key:

```typescript
cacheKeyRules: {
  header: {
    include: ['x-api-version'],
    checkPresence: ['x-feature-flag']
  }
}
```

**Restricted headers:** For security and performance, certain headers cannot be included:

- **High-cardinality headers**: `accept`, `accept-charset`, `accept-encoding`, `accept-language`, `user-agent`, `referer`
- **Cache/proxy headers**: `cache-control`, `if-*`, `range`, `connection`
- **Authentication headers**: `authorization`, `cookie` (handled separately by cookie rules)
- **Headers handled by other features**: `host`

## Cache Status Monitoring

SharedCache provides comprehensive monitoring through the `x-cache-status` header for debugging and performance analysis.

### Cache Status Types

| Status        | Description                                        | When It Occurs                                             |
| ------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `HIT`         | Response served from cache                         | Fresh cache hit, or conditional `304` from `Cache.match()` |
| `MISS`        | Response fetched from origin                       | The requested resource was not found in cache              |
| `EXPIRED`     | Cached response expired, fresh response fetched    | The cached response exceeded its TTL                       |
| `UPDATING`    | Stale response served during background revalidate | `stale-while-revalidate` via `createFetch`                 |
| `STALE`       | Stale response served when origin is unreachable   | `stale-if-error` or revalidation failure                   |
| `BYPASS`      | Cache bypassed                                     | Bypassed due to cache control directives like `no-store`   |
| `REVALIDATED` | Cached response revalidated with origin            | Synchronous revalidation; origin returned 304 Not Modified |
| `DYNAMIC`     | Response cannot be cached                          | Cannot be cached due to HTTP method or status code         |

### Cache Status Header Details

The `x-cache-status` header is automatically added to all responses:

- **Header Values**: `HIT`, `MISS`, `EXPIRED`, `UPDATING`, `STALE`, `BYPASS`, `REVALIDATED`, `DYNAMIC`
- **Always Present**: The header is always added for monitoring and debugging
- **Non-Standard**: Custom header for debugging - should not be used for application logic
