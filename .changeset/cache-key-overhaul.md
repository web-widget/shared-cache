---
'@web-widget/shared-cache': minor
---

Overhaul cache key generation for safety and HTTP alignment:

- Use standard SHA-1 digests for fragment and Vary value hashing; fragment key names stay visible (`#cookie:a|device|header:x-id@digest`)
- Adopt unambiguous `|v|` / `|vary|` delimiters for Vary-aware keys (`|v|accept-language@digest`)
- Include URL scheme in default keys (`https://…`)
- Rely on URL API parsing for scheme/host/port canonicalization; optional `_cacheKeyNormalize` for pathname-level tweaks only
- Align `CacheQueryOptions` with Cloudflare Workers (`ignoreMethod` only; use `cacheKeyRules.search: false` to ignore query strings)

**Breaking:** Cache key format changes invalidate existing entries until they expire or are revalidated. Set `scheme: false` to keep the previous host-first URL shape. Remove `cacheKeyPartDefiners` / `SharedCacheKeyPartDefiners`; use built-in `cacheKeyRules` only.
