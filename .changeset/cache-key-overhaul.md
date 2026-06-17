---
'@web-widget/shared-cache': major
---

Fix cache key safety, HTTP semantics, and Vary handling:

- **Reduce wrong cache hits from digest collisions** — cookie/header/device values are hashed with a single standard SHA-1 digest over a canonical string, instead of per-value truncated digests that could collide at scale.
- **Stop `http` and `https` from sharing the same entry** — URL scheme is included in default keys so representations are not mixed across schemes (RFC 9111 URI identity).
- **Make Vary-aware keys unambiguous** — use explicit `|v|` / `|vary|` suffixes so base keys, Vary metadata, and variants cannot be parsed incorrectly.
- **Keep keys debuggable without exposing secrets** — fragment key names stay visible (`#cookie:a|header:x-id@…`); only normalized values are digested.
- **Align cache lookup options with Workers Cache API** — `match()` / `delete()` support `ignoreMethod` only; ignore query strings via `cacheKeyRules.search: false`, and bypass Vary via `sharedCache.ignoreVary`.

**Breaking:** Existing cache entries miss until they expire or are revalidated. Set `scheme: false` to keep the previous host-first URL shape. Remove `cacheKeyPartDefiners` / `SharedCacheKeyPartDefiners`; use built-in `cacheKeyRules` only.
