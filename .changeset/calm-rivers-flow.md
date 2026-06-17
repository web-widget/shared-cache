---
'@web-widget/shared-cache': minor
---

Fix 304 revalidation persistence so background revalidation with `304 Not Modified` stores the revalidated policy instead of rebuilding from stale response headers (restores fresh `HIT` on subsequent requests).

Add `UPDATING` cache status for `stale-while-revalidate` (aligns with Cloudflare CDN semantics; `STALE` is reserved for `stale-if-error`).

Return `304 Not Modified` from `Cache.match()` when conditional request headers (`If-None-Match`, `If-Modified-Since`) match a fresh cached entry.

Percent-encode `x-cache-key` header values so cache keys with control characters or non-Latin-1 Unicode are valid HTTP header field values.

Strip persisted `Age` from stored policy metadata on read for compatibility with entries written before the revalidation fix.
