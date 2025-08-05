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
