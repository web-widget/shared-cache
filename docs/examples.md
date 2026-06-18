# Examples

[← Back to README](../README.md) · [Documentation index](./README.md)

## Basic API Caching

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

## Redis Backend

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

## Device-Specific Caching

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

## Advanced Cache Key Rules

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

## Custom Storage Backend

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

## Multi-tenant Caching

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

## Custom Fetch with Authentication

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
