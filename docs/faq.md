# Frequently Asked Questions

[← Back to README](../README.md) · [Documentation index](./README.md)

## Can I use different storage backends in production?

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

See [Examples](./examples.md#redis-backend) for a complete Redis integration.

## How does SharedCache handle concurrent requests?

**A:** SharedCache handles concurrent requests efficiently by serving cache entries and avoiding duplicate network requests.

## Is SharedCache compatible with edge runtimes?

**A:** SharedCache is technically compatible with edge runtimes, but it's typically not needed in edge environments. Most edge runtimes (Cloudflare Workers, Vercel Edge Runtime, Deno Deploy) already provide native `caches` API implementation.

**Primary use cases for SharedCache:**

- **Node.js environments** - Where the `caches` API is not natively available
- **Development environments** - For consistent caching behavior across different runtimes
- **Meta-frameworks** - Like [Web Widget](https://github.com/web-widget/web-widget) that enable seamless migration between environments
- **Custom storage backends** - When you need Redis, database, or other storage solutions

**Migration benefits:**

When using SharedCache with meta-frameworks, you can develop with a consistent caching API and deploy to any environment - whether it has native `caches` support or not. This provides true runtime portability for your caching logic.

## What's the value of `stale-while-revalidate` and `stale-if-error` directives?

**A:** Performance and reliability extensions (via `createFetch`):

- **stale-while-revalidate**: Serves cached content immediately while updating in background, providing zero-latency responses
- **stale-if-error**: Serves cached content when origin servers fail, improving uptime and user experience

## How does SharedCache handle Vary headers and what are the performance implications?

**A:** SharedCache processes Vary headers by default, which requires **two KV storage queries** per cache lookup:

1. **First query**: Get Vary metadata from base cache key
2. **Second query**: Get actual response from variant cache key

**Performance impact:**

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

See [Configuration](./configuration.md#ignorevary) for more details.
