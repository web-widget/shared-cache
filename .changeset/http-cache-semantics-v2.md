---
'@web-widget/shared-cache': minor
---

Upgrade to `@web-widget/http-cache-semantics` 2.0.1 and migrate cache policy evaluation to `evaluateRequest()`.

- Normalize requests at the cache layer before calling `evaluateRequest()` (replacing removed `CacheQueryOptions`)
- Use `evaluateRequest()` for stale-while-revalidate and synchronous revalidation
- Rely on `revalidatedPolicy()` for stale-if-error handling (removed public `useStaleIfError()`)
