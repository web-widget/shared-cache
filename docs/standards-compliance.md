# Standards Compliance

[← Back to README](../README.md) · [Documentation index](./README.md)

SharedCache demonstrates exceptional HTTP standards compliance, fully adhering to established web caching specifications.

## HTTP Caching Standards (RFC 7234)

**Complete compliance features:**

- **Cache Control Directives**: Proper handling of `no-store`, `no-cache`, `private`, `public`, `s-maxage`, and `max-age`
- **HTTP Method Support**: Standards-compliant caching for GET/HEAD methods with correct rejection of non-cacheable methods
- **Status Code Handling**: Appropriate caching behavior for 200, 301, 404 responses and proper rejection of 5xx errors
- **Vary Header Processing**: Full content negotiation support with intelligent cache key generation
- **Conditional Requests**: `Cache.match()` returns `304` for matching `If-None-Match` / `If-Modified-Since` on fresh entries; `createFetch` revalidates with the origin and handles `304 Not Modified`

## RFC 5861 Extensions

- **stale-while-revalidate**: Background revalidation with immediate stale content serving
- **stale-if-error**: Graceful degradation serving cached content during network failures
- **Fault Tolerance**: Robust error handling and recovery mechanisms

## Web Cache API Compatibility

SharedCache implements a subset of the standard Web Cache API interface, focusing on core caching operations:

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

**Implementation status:**

- ✅ **Core Methods**: `match()`, `put()`, `delete()` - Fully implemented with HTTP semantics
- ❌ **Convenience Methods**: `add()`, `addAll()` - Use `put()` instead
- ❌ **Enumeration Methods**: `keys()`, `matchAll()` - Not available in server environments

**`createFetch` vs `Cache`**: `createFetch` adds SWR, origin revalidation, and status headers. Bare `cache.match()` / `cache.put()` are storage-style APIs (expired entries return `undefined` without `createFetch`).

**`createFetch` vs `createCacheHandler`**: Same caching core. `createFetch` wraps outbound `fetch`; `createCacheHandler` accepts an in-process origin callback.

**Options parameter differences:**

`match()` and `delete()` support `ignoreMethod` only—the same subset as the [Cloudflare Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/). To ignore query strings, set `cacheKeyRules.search: false`. To bypass Vary processing, set `sharedCache.ignoreVary: true`.

## Compliance Summary

| Standard                       | Status                   | Coverage     |
| ------------------------------ | ------------------------ | ------------ |
| RFC 7234 (HTTP Caching)        | ✅ Fully Compliant       | 100%         |
| RFC 5861 (stale-\* extensions) | ✅ Fully Compliant       | 100%         |
| Web Cache API                  | ✅ Subset Implementation | Core Methods |
| WinterCG Standards             | ✅ Fully Supported       | 100%         |

## Production-Grade Implementation

- **Professional HTTP Semantics**: Powered by [`http-cache-semantics`](https://github.com/web-widget/http-cache-semantics) for RFC compliance
- **Configurable Cache Keys**: Rules for URL parts, cookies, headers, and custom fragments
- **Robust Error Handling**: Comprehensive exception handling with graceful degradation
- **Performance Optimized**: Efficient storage backends with configurable TTL

## Security & Best Practices

- **Privacy Compliance**: Correct handling of `private` directive for user-specific content
- **Shared Cache Optimization**: Priority given to `s-maxage` over `max-age` for multi-user environments
- **Authorization Header Handling**: Automatic compliance with HTTP specification - responses to requests with `Authorization` headers are not cached in shared caches unless explicitly permitted by response cache control directives
- **Cache Isolation**: Proper separation of cached content based on user context and authentication state
- **Secure Defaults**: Conservative caching policies with explicit opt-in for sensitive operations

**🔒 Important Security Note**: SharedCache automatically enforces HTTP caching security rules. Requests containing `Authorization` headers will not be cached unless the response explicitly allows it with directives like `public`, `s-maxage`, or `must-revalidate`. This ensures compliance with shared cache security requirements.

SharedCache is production-ready and battle-tested, providing enterprise-grade HTTP caching with full standards compliance for server-side applications.
