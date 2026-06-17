/** Headers that must not appear on 304 responses (RFC 7232). */
const NOT_MODIFIED_OMIT_HEADERS = new Set([
  'content-length',
  'content-type',
  'content-encoding',
  'transfer-encoding',
]);

export function hasConditionalRequestHeaders(request: Request): boolean {
  return (
    request.headers.has('if-none-match') ||
    request.headers.has('if-modified-since')
  );
}

/**
 * Returns true when conditional request headers are satisfied by cached response headers.
 * Matches Cloudflare Cache API behavior for If-None-Match and If-Modified-Since on match().
 */
export function satisfiesConditionalRequest(
  request: Request,
  responseHeaders: Headers
): boolean {
  const ifNoneMatch = request.headers.get('if-none-match');

  if (ifNoneMatch) {
    const cachedEtag = responseHeaders.get('etag');
    if (!cachedEtag) {
      return false;
    }
    if (ifNoneMatch.trim() === '*') {
      return true;
    }

    const cachedTag = normalizeEntityTag(cachedEtag);
    return ifNoneMatch.split(',').some((tag) => {
      return normalizeEntityTag(tag) === cachedTag;
    });
  }

  const ifModifiedSince = request.headers.get('if-modified-since');
  if (ifModifiedSince) {
    const lastModified = responseHeaders.get('last-modified');
    if (!lastModified) {
      return false;
    }

    const ifModifiedSinceTime = Date.parse(ifModifiedSince);
    const lastModifiedTime = Date.parse(lastModified);
    if (
      !Number.isFinite(ifModifiedSinceTime) ||
      !Number.isFinite(lastModifiedTime)
    ) {
      return false;
    }

    return lastModifiedTime <= ifModifiedSinceTime;
  }

  return false;
}

function normalizeEntityTag(tag: string): string {
  return tag.trim().replace(/^\s*W\//, '');
}

export function createNotModifiedResponse(responseHeaders: Headers): Response {
  const headers = new Headers();

  responseHeaders.forEach((value, name) => {
    if (!NOT_MODIFIED_OMIT_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  });

  return new Response(null, {
    status: 304,
    statusText: 'Not Modified',
    headers,
  });
}

export function isErrorResponse(response: Response): boolean {
  return response.status >= 500;
}
