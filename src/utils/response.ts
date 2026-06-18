import { CACHE_STATUS_HEADER_NAME } from '../constants';
import type { CacheStatus } from '../constants';

/**
 * Utility functions for working with Response objects
 */

/**
 * Modifies response headers by creating a new Response object when necessary.
 * This function handles readonly headers by creating a new Headers object and Response
 * only when modifications are actually needed.
 *
 * @param response - The original Response object
 * @param modifier - Function that modifies the headers object
 * @returns A new Response with modified headers, or the original if no modifications were made
 */
export function modifyResponseHeaders(
  response: Response,
  modifier: (headers: Headers) => void
): Response {
  try {
    // Try to modify headers directly first (for performance)
    modifier(response.headers);
    return response;
  } catch (_error) {
    // If headers are readonly (fallback check), create a new Response with new headers
    const newHeaders = new Headers(response.headers);
    modifier(newHeaders);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }
}

/**
 * Encodes a cache key for safe use as an HTTP header field value.
 *
 * Cache keys may contain Unicode path segments, query values, or control
 * characters that violate Fetch header constraints (NUL/CR/LF) or runtime
 * ByteString limits (code points above U+00FF).
 *
 * @param cacheKey - Raw cache key from storage key generation
 * @returns Header-safe cache key (ASCII-only, percent-encoded where needed)
 */
export function encodeCacheKeyHeaderValue(cacheKey: string): string {
  let encoded = '';

  for (const char of cacheKey) {
    const code = char.codePointAt(0)!;

    if (code === 0 || code === 0xa || code === 0xd || code > 0xff) {
      encoded += encodeURIComponent(char);
    } else {
      encoded += char;
    }
  }

  return encoded;
}

/**
 * Safely sets a header on a response, creating a new response if headers are readonly.
 * This is a convenience function for setting a single header.
 *
 * @param response - The original Response object
 * @param name - Header name to set
 * @param value - Header value to set
 * @returns A Response with the header set
 */
export function setResponseHeader(
  response: Response,
  name: string,
  value: string
): Response {
  return modifyResponseHeaders(response, (headers) => {
    headers.set(name, value);
  });
}

/**
 * Applies the cache status header. Uses in-place mutation by default; pass
 * `copy: true` when the response may have readonly headers (resolve path).
 */
export function applyCacheStatus(
  response: Response,
  status: CacheStatus,
  { copy = false }: { copy?: boolean } = {}
): Response {
  if (response.headers.has(CACHE_STATUS_HEADER_NAME)) {
    return response;
  }

  if (copy) {
    return setResponseHeader(response, CACHE_STATUS_HEADER_NAME, status);
  }

  response.headers.set(CACHE_STATUS_HEADER_NAME, status);
  return response;
}
