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

A standards-compliant HTTP cache implementation for server-side applications.

SharedCache is an HTTP caching library that follows Web Standards and HTTP specifications. It implements a cache interface similar to the [Web Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) but optimized for server-side shared caching scenarios.

## 📋 Table of Contents

- [✨ Key Features](#-key-features)
- [🤔 Why SharedCache?](#-why-sharedcache)
- [⚡ Quick Decision Guide](#-quick-decision-guide)
- [📦 Installation](#-installation)
- [🚀 Quick Start](#-quick-start)
- [📋 Standards Compliance](#-standards-compliance)
- [☁️ Cloudflare Comparison](#️-cloudflare-comparison)
- [📖 Documentation](#-documentation)
- [🤝 Who's Using SharedCache](#-whos-using-sharedcache)
- [🙏 Acknowledgments](#-acknowledgments)
- [📄 License](#-license)

## ✨ Key Features

- 📋 **RFC Compliance**: Supports [RFC 5861](https://tools.ietf.org/html/rfc5861) directives like `stale-if-error` and `stale-while-revalidate`
- 🎯 **Smart Caching**: Handles complex HTTP scenarios including `Vary` headers, proxy revalidation, and authenticated responses
- 🔧 **Flexible Storage**: Pluggable storage backend supporting memory, Redis, or any custom key-value store
- 🚀 **Enhanced Fetch**: Extends the standard `fetch` API with caching capabilities while maintaining full compatibility
- 🔌 **Middleware Origin**: `createCacheHandler` for in-process handlers (e.g. middleware `next()`)
- 🎛️ **Custom Cache Keys**: Cache key customization supporting device types, cookies, headers, and URL components
- ⚡ **Shared Cache Optimization**: Prioritizes `s-maxage` over `max-age` for shared cache performance
- 🌍 **Universal Runtime**: Compatible with [WinterCG](https://wintercg.org/) environments including Node.js, Deno, Bun, and Edge Runtime

## 🤔 Why SharedCache?

While the Web `fetch` API has become ubiquitous in server-side JavaScript, existing browser Cache APIs are designed for single-user scenarios. Server-side applications need shared caches that serve multiple users efficiently.

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

```typescript
import {
  CacheStorage,
  createFetch,
  type KVStorage,
} from '@web-widget/shared-cache';
import { LRUCache } from 'lru-cache';

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

const caches = new CacheStorage(createLRUCache());

async function example() {
  const cache = await caches.open('api-cache-v1');

  const fetch = createFetch(cache, {
    defaults: {
      cacheControlOverride: 's-maxage=300',
      ignoreRequestCacheControl: true,
    },
  });

  const response1 = await fetch(
    'https://httpbin.org/response-headers?cache-control=max-age%3D604800'
  ); // First request: network

  const response2 = await fetch(
    'https://httpbin.org/response-headers?cache-control=max-age%3D604800'
  ); // Second request: cache

  console.log(response2.headers.get('x-cache-status')); // "HIT"
}

example();
```

### Core APIs

| Export                   | Purpose                              |
| ------------------------ | ------------------------------------ |
| `createFetch`            | Outbound HTTP fetch with caching     |
| `createCacheHandler`     | In-process origin (middleware / SSR) |
| `CacheStorage` / `Cache` | Cache storage and operations         |
| `KVStorage`              | Pluggable storage backend interface  |

Every response includes an `x-cache-status` header (`HIT`, `MISS`, `UPDATING`, `STALE`, …) for debugging. See the [configuration guide](docs/configuration.md#cache-status-monitoring) for the full status table.

## 📋 Standards Compliance

SharedCache is built for production HTTP caching with full adherence to web standards:

| Standard                                                                | Status             | Coverage                                |
| ----------------------------------------------------------------------- | ------------------ | --------------------------------------- |
| [RFC 7234](https://tools.ietf.org/html/rfc7234) (HTTP Caching)          | ✅ Fully Compliant | 100%                                    |
| [RFC 5861](https://tools.ietf.org/html/rfc5861) (`stale-*` extensions)  | ✅ Fully Compliant | 100%                                    |
| [Web Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) | ✅ Subset          | Core methods (`match`, `put`, `delete`) |
| [WinterCG](https://wintercg.org/)                                       | ✅ Fully Supported | 100%                                    |

**Highlights:**

- **RFC 7234**: Cache-Control directives, GET/HEAD caching, Vary processing, conditional requests
- **RFC 5861**: `stale-while-revalidate` and `stale-if-error` via `createFetch`
- **Web Cache API**: Core methods with HTTP semantics; `match()` / `delete()` support `ignoreMethod` (same subset as [Cloudflare Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/))
- **Security**: Requests with `Authorization` headers are not cached unless the response explicitly allows it (`public`, `s-maxage`, etc.)

Powered by [`http-cache-semantics`](https://github.com/web-widget/http-cache-semantics) for RFC-compliant cache policy evaluation.

**[→ Full standards compliance guide](docs/standards-compliance.md)** — Web Cache API details, security notes, and implementation status.

## ☁️ Cloudflare Comparison

SharedCache is designed for **origin-side caching** (application servers with pluggable `KVStorage` such as Redis or S3), not as a replacement for Cloudflare's global edge cache. Where it helps to align with Cloudflare semantics, the library mirrors familiar patterns from the CDN and [Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/):

- **Cache Key** — public `cacheKeyRules` (`search`, `header`, `cookie`, `device`) vs [Cloudflare Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-keys/)
- **Cache Status** — `x-cache-status` (`HIT`, `MISS`, `UPDATING`, `STALE`, …) vs `CF-Cache-Status`
- **Workers Cache API** — `match()` / `delete()` with `ignoreMethod` only; no `ignoreSearch` / `ignoreVary`
- **Storage** — `KVStorage` at the origin vs platform-managed edge / Workers cache

**[→ Full comparison guide](docs/cloudflare-cache-comparison.md)** — quick reference table and detailed notes.

## 📖 Documentation

| Guide                                                        | Description                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| [Examples](docs/examples.md)                                 | Redis, multi-tenant, authentication, and custom storage patterns     |
| [Configuration](docs/configuration.md)                       | Global setup, `sharedCache` options, cache key rules, and monitoring |
| [API Reference](docs/api-reference.md)                       | Complete API signatures and type definitions                         |
| [Logging](docs/logging.md)                                   | Logger setup, log levels, and debugging techniques                   |
| [FAQ](docs/faq.md)                                           | Storage backends, edge runtimes, Vary performance, and more          |
| [Standards Compliance](docs/standards-compliance.md)         | RFC details, Web Cache API subset, and security notes                |
| [Cloudflare Comparison](docs/cloudflare-cache-comparison.md) | Mapping to Cloudflare Cache Rules and Workers Cache API              |

## 🤝 Who's Using SharedCache

- [Web Widget Meta Framework: Cache middleware](https://github.com/web-widget/web-widget/blob/main/packages/middlewares/src/cache.ts)
- [InsMind.com: Page Cache](https://www.insmind.com/)
- [Gaoding.com: Page Cache (Million-level URLs)](https://www.gaoding.com/)

## 🙏 Acknowledgments

SharedCache draws inspiration from industry-leading caching implementations:

- **[Cloudflare Cache Key](https://developers.cloudflare.com/cache/how-to/cache-keys/)** - Cache key customization patterns
- **[Next.js Data Cache](https://nextjs.org/docs/app/building-your-application/caching#data-cache)** - Server-side caching strategies
- **[nodejs/undici](https://github.com/nodejs/undici/blob/main/lib/web/cache/cache.js)** - Web Standards implementation
- **[http-cache-lru](https://github.com/o-development/http-cache-lru/)** - HTTP cache semantics
- **[Cloudflare Miniflare](https://github.com/cloudflare/miniflare/blob/master/packages/cache/src/cache.ts)** - Edge runtime patterns
- **[Cloudflare Workers SDK](https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/src/workers/cache/cache.worker.ts)** - Worker environment optimizations
- **[ultrafetch](https://github.com/natemoo-re/ultrafetch)** - Fetch API extensions
- **[island.is Cache Middleware](https://github.com/island-is/island.is/blob/main/libs/clients/middlewares/src/lib/withCache/withCache.ts)** - Production caching patterns
- **[make-fetch-happen](https://github.com/npm/make-fetch-happen)** - HTTP caching with retry and offline support

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.
