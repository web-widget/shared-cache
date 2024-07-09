---
'@web-widget/shared-cache': patch
---

- The stale-while-revalidate and stale-if-error directives are not supported when using the cache.put or cache.match methods.
- Support HEAD requests.
