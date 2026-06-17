---
'@web-widget/shared-cache': minor
---

Simplify the package internals with no intended behavior change for supported public APIs.

**Breaking:** Deprecated logger helpers are removed. Use `createLogger(logger, level, 'SharedCache')` instead of `createSharedCacheLogger(logger, level)`.

**Breaking:** Rename public types for consistent naming: `SharedCacheKeyRules` → `CacheKeyRules`, `FilterOptions` → `KeyFilterOptions`, `SharedCacheLogContext` → `CacheLogContext`, `SharedCacheStatus` → `CacheStatus`.
