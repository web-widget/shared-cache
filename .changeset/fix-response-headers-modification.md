---
"@web-widget/shared-cache": patch
---

fix: Fix Response headers modification bug in createInterceptor function

The createInterceptor function was attempting to directly modify the Response.headers object, which is read-only in both browser and Node.js environments. This caused the cacheControlOverride and varyOverride options to not work properly.

Changes made:
- Create a new Headers object from the original response headers
- Apply header modifications to the new Headers object
- Create a new Response object with the modified headers
- Return the new Response for successful responses

This fix ensures that cacheControlOverride and varyOverride work correctly for successful responses while maintaining backward compatibility. 